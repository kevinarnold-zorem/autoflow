import { cold } from 'react-hot-loader';
import { TAXY_ELEMENT_SELECTOR } from '../constants';
import { useAppState } from '../state/store';
import { callRPC } from './pageRPC';
import { scrollScriptString } from './runtimeFunctionStrings';
import { sleep } from './utils';

async function sendCommand(method: string, params?: any) {
  const tabId = useAppState.getState().currentTask.tabId;
  return chrome.debugger.sendCommand({ tabId }, method, params);
}



async function getObjectId(originalId: number) {
  const uniqueId = await callRPC('getUniqueElementSelectorId', [originalId]);
  // get node id
  const document = (await sendCommand('DOM.getDocument')) as any;
  const { nodeId } = (await sendCommand('DOM.querySelector', {
    nodeId: document.root.nodeId,
    selector: `[${TAXY_ELEMENT_SELECTOR}="${uniqueId}"]`,
  })) as any;
  if (!nodeId) {
    throw new Error('Could not find node');
  }
  // get object id
  const result = (await sendCommand('DOM.resolveNode', { nodeId })) as any;
  const objectId = result.object.objectId;
  if (!objectId) {
    throw new Error('Could not find object');
  }
  return objectId;
}

async function scrollIntoView(objectId: string) {
  await sendCommand('Runtime.callFunctionOn', {
    objectId,
    functionDeclaration: scrollScriptString,
  });
  await sleep(1000);
}

async function getCenterCoordinates(objectId: string) {
  const { model } = (await sendCommand('DOM.getBoxModel', { objectId })) as any;
  const [x1, y1, x2, y2, x3, y3, x4, y4] = model.border;
  const centerX = (x1 + x3) / 2;
  const centerY = (y1 + y3) / 2;
  return { x: centerX, y: centerY };
}

const delayBetweenClicks = 1000; // Set this value to control the delay between clicks
const delayBetweenKeystrokes = 100; // Set this value to control typing speed
//desplazamiento para checkbox
const offsetX = 2;     // Desplazamiento horizontal (derecha)
const offsetY = 12;     // Desplazamiento vertical (abajo)


async function drawClickAtPosition(x: number,y: number) {
  // Obtener el nodo de la pestaña actual
  const document = (await sendCommand('DOM.getDocument')) as any;

  // Crear el elemento visual para mostrar la posición del clic
  const visualElementId = `zorem-click-visual-element-${Date.now()}`;
  //console.log(visualElementId);

  const createVisualElementScript = `
    const visualElement = document.createElement('div');
    visualElement.id = '${visualElementId}';
    visualElement.style.position = 'fixed';
    visualElement.style.left = '${x}px';
    visualElement.style.top = '${y}px';
    visualElement.style.width = '10px';
    visualElement.style.height = '10px';
    visualElement.style.borderRadius = '50%';
    visualElement.style.backgroundColor = 'red';
    visualElement.style.zIndex = '9999';

    document.documentElement.appendChild(visualElement);
  `;

  // Ejecutar el script para crear el elemento visual en la pestaña actual
  await sendCommand('Runtime.evaluate', {
    expression: createVisualElementScript,
    contextId: document.executionContextId,
  });
}

async function clickAtPosition(
  x: number,
  y: number,
  clickCount = 1
): Promise<void> {
  callRPC('ripple', [x, y]);
  await drawClickAtPosition(x,y); //generara un punto donde se realizo el clic
  await sendCommand('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x,
    y,
    button: 'left',
    clickCount,
  });
  await sendCommand('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x,
    y,
    button: 'left',
    clickCount,
  });
  await sleep(delayBetweenClicks);
}

async function click(payload: { elementId: number }) {
  //console.log("Se realizo un Click");
  const objectId = await getObjectId(payload.elementId);
  await scrollIntoView(objectId);
  const { x, y } = await getCenterCoordinates(objectId);

  // Obtener información sobre el nodo
  const nodeInfo = (await sendCommand('DOM.describeNode', { objectId })) as any;
  //console.log('Información del nodo:', JSON.stringify(nodeInfo.node));
  //console.log(nodeInfo.node.attributes);

  // Generaremos un if para el elemento checkbox cambiando las coordenadas del clic
  if(nodeInfo.node.nodeName.toLowerCase() === 'input' &&  nodeInfo.node.attributes && nodeInfo.node.attributes.includes('checkbox')){
    await clickAtPosition(x+offsetX, y+offsetY);
  }
  else {
    await clickAtPosition(x, y);
  }
}

async function selectAllText(x: number, y: number) {
  await clickAtPosition(x, y, 3);
}

async function typeText(text: string): Promise<void> {
  for (const char of text) {
    await sendCommand('Input.dispatchKeyEvent', {
      type: 'keyDown',
      text: char,
    });
    await sleep(delayBetweenKeystrokes / 2);
    await sendCommand('Input.dispatchKeyEvent', {
      type: 'keyUp',
      text: char,
    });
    await sleep(delayBetweenKeystrokes / 2);
  }
}

async function blurFocusedElement() {
  const blurFocusedElementScript = `
      if (document.activeElement) {
        document.activeElement.blur();
      }
    `;
  await sendCommand('Runtime.evaluate', {
    expression: blurFocusedElementScript,
  });
}

async function setValue(payload: {
  elementId: number;
  value: string;
}): Promise<void> {
  //console.log("Se realizo un SetValue");
  const objectId = await getObjectId(payload.elementId);
  await scrollIntoView(objectId);
  const { x, y } = await getCenterCoordinates(objectId);

  await selectAllText(x, y);
  await typeText(payload.value);
  // blur the element
  await blurFocusedElement();
}

export const domActions = {
  click,
  setValue,
} as const;

export type DOMActions = typeof domActions;
type ActionName = keyof DOMActions;
type ActionPayload<T extends ActionName> = Parameters<DOMActions[T]>[0];

// Call this function from the content script
export const callDOMAction = async <T extends ActionName>(
  type: T,
  payload: ActionPayload<T>,
  tabId: number
): Promise<void> => {
  // @ts-expect-error - we know that the type is valid
  await domActions[type](payload);
  await sleep(3000);
  
};

export const captureScreenshot = async (): Promise<string> => {
  return new Promise<string>((resolve, reject) => {
    chrome.tabs.captureVisibleTab({ format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError);
        reject(chrome.runtime.lastError.message);
      } else if (dataUrl) {
        resolve(dataUrl);
      } else {
        reject('Failed to capture screenshot');
      }
    });
  });
};
