import { CreateCompletionResponseUsage } from 'openai';
import { attachDebugger, detachDebugger } from '../helpers/chromeDebugger';
import {
  disableIncompatibleExtensions,
  reenableExtensions,
} from '../helpers/disableExtensions';
import { callDOMAction,captureScreenshot } from '../helpers/domActions';
import {
  ParsedResponse,
  ParsedResponseSuccess,
  parseResponse,
} from '../helpers/parseResponse';
import { determineNextAction } from '../helpers/determineNextAction';
import templatize from '../helpers/shrinkHTML/templatize';
import { getSimplifiedDom } from '../helpers/simplifyDom';
import { sleep, truthyFilter } from '../helpers/utils';
import { MyStateCreator } from './store';

import { addStepToReport, generateReport, ReportResponse } from '../helpers/api_reporter';
import { addStepToGenerator } from '../helpers/api_steps';

function extractValuesFromResponse(response: string): { thoughtContent: string, actionContent: string } {
  const thoughtRegex = /<Thought>(.*?)<\/Thought>/;
  const thoughtMatches = response.match(thoughtRegex);
  const thoughtContent = thoughtMatches ? thoughtMatches[1] : '';

  const actionRegex = /<Action>(.*?)<\/Action>/;
  const actionMatches = response.match(actionRegex);
  const actionContent = actionMatches ? actionMatches[1] : '';

  return { thoughtContent, actionContent };
}

export type TaskHistoryEntry = {
  prompt: string;
  response: string;
  action: ParsedResponse;
  usage: CreateCompletionResponseUsage;
};

export type CurrentTaskSlice = {
  tabId: number;
  instructions: string | null;
  history: TaskHistoryEntry[];
  status: 'idle' | 'running' | 'success' | 'error' | 'interrupted';
  actionStatus:
    | 'idle'
    | 'attaching-debugger'
    | 'pulling-dom'
    | 'transforming-dom'
    | 'performing-query'
    | 'performing-action'
    | 'waiting';
  actions: {
    runTask: (onError: (error: string) => void) => Promise<void>;
    interrupt: () => void;
  };
};
export const createCurrentTaskSlice: MyStateCreator<CurrentTaskSlice> = (
  set,
  get
) => ({
  tabId: -1,
  instructions: null,
  history: [],
  status: 'idle',
  actionStatus: 'idle',
  actions: {
    runTask: async (onError) => {
      const wasStopped = () => get().currentTask.status !== 'running';
      const setActionStatus = (status: CurrentTaskSlice['actionStatus']) => {
        set((state) => {
          state.currentTask.actionStatus = status;
        });
      };

      const instructions = get().ui.instructions;
      
      if (!instructions || get().currentTask.status === 'running') return;

      set((state) => {
        state.currentTask.instructions = instructions;
        state.currentTask.history = [];
        state.currentTask.status = 'running';
        state.currentTask.actionStatus = 'attaching-debugger';
      });

      try {
        const activeTab = (
          await chrome.tabs.query({ active: true, currentWindow: true })
        )[0];

        if (!activeTab.id) throw new Error('No active tab found');
        const tabId = activeTab.id;
        set((state) => {
          state.currentTask.tabId = tabId;
        });

        await attachDebugger(tabId);
        await disableIncompatibleExtensions();

        const instructionList = instructions.split('\n');
        const timestamp = new Date().getTime();
        const projectName = `proyecto_lorem_${timestamp}`;

        // eslint-disable-next-line no-constant-condition
        for (const instruction of instructionList) {
          
          if (wasStopped()) {
            //await generateReport(projectName);
            break;
          } 

          setActionStatus('pulling-dom');
          const pageDOM = await getSimplifiedDom();
          if (!pageDOM) {
            set((state) => {
              state.currentTask.status = 'error';
            });
            break;
          }
          //console.log("pageDOM: "+pageDOM.outerHTML);
          const html = pageDOM.outerHTML;

          if (wasStopped()) break;
          setActionStatus('transforming-dom');
          //const currentDom = templatize(html);
          const currentDom = html;
          //console.log("currentDom: "+pageDOM.outerHTML);
          
          const previousActions = get()
            .currentTask.history.map((entry) => entry.action)
            .filter(truthyFilter);

          setActionStatus('performing-query');
          
          const query = await determineNextAction(
            instruction,
            previousActions.filter(
              (pa) => !('error' in pa)
            ) as ParsedResponseSuccess[],
            currentDom,
            3,
            onError
          );

          if (!query) {
            set((state) => {
              state.currentTask.status = 'error';
            });
            break;
          }

          if (wasStopped()) break;

          setActionStatus('performing-action');
          const action = parseResponse(query.response);
          //send Steps To Generator .js
          const extractedValues = extractValuesFromResponse(query.response);
          await addStepToGenerator(extractedValues.thoughtContent,extractedValues.actionContent,html,projectName);

          set((state) => {
            state.currentTask.history.push({
              prompt: query.prompt,
              response: query.response,
              action,
              usage: query.usage,
            });
          });
          if ('error' in action) {
            onError(action.error);
            break;
          }
          if (
            action === null ||
            action.parsedAction.name === 'finish' ||
            action.parsedAction.name === 'fail'
          ) {
            break;
          }

          if (action.parsedAction.name === 'click') {
            await callDOMAction('click', action.parsedAction.args,get().currentTask.tabId);
          } else if (action.parsedAction.name === 'setValue') {
            await callDOMAction(
              action?.parsedAction.name,
              action?.parsedAction.args,
              get().currentTask.tabId
            );
          }
          
          // Generando reporte 
          if (!wasStopped()) {
            const imageBase64 = await captureScreenshot();
            await addStepToReport(projectName, instruction, imageBase64);
          }
          
          if (wasStopped()) break;

          // While testing let's automatically stop after 50 actions to avoid
          // infinite loops
          if (get().currentTask.history.length >= 50) {
            break;
          }

          setActionStatus('waiting');
          // sleep 2 seconds. This is pretty arbitrary; we should figure out a better way to determine when the page has settled.
          await sleep(2000);
        }
        
        set((state) => {
          state.currentTask.status = 'success';
        });

        //generate a report at the end of the iteration of the instructions
        const reportResponse: ReportResponse = await generateReport(projectName);
        if (reportResponse) {
          
          const fileUrl = reportResponse.fileUrl;
          console.log(`Reporte generado con éxito. URL: ${fileUrl}`);
          
        }

      } catch (e: any) {
        onError(e.message);
        set((state) => {
          state.currentTask.status = 'error';
        });
      } finally {
        await detachDebugger(get().currentTask.tabId);
        await reenableExtensions();
      }
    },
    interrupt: () => {
      set((state) => {
        state.currentTask.status = 'interrupted';
      });
    },
  },
});
