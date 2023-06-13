import {
  Configuration,
  CreateCompletionResponseUsage,
  OpenAIApi,
} from 'openai';
import { useAppState } from '../state/store';
import { availableActions } from './availableActions';
import { ParsedResponseSuccess } from './parseResponse';


const formattedActions = availableActions
  .map((action, i) => {
    const args = action.args
      .map((arg) => `${arg.name}: ${arg.type}`)
      .join(', ');
    return `${i + 1}. ${action.name}(${args}): ${action.description}`;
  })
  .join('\n');

/*const systemMessage = `
You are a browser automation assistant.

You can use the following tools:

${formattedActions}

You will be be given a task to perform and the current state of the DOM. You will also be given previous actions that you have taken. You may retry a failed action up to one time.

This is an example of an action:

<Thought>I should click the add to cart button</Thought>
<Action>click(223)</Action>

You must always include the <Thought> and <Action> open/close tags or else your response will be marked as invalid.`;
*/

/*const systemMessage = `
Eres un asistente de automatización de navegador.

Puedes utilizar las siguientes herramientas:

${formattedActions}

Se te dará unas tareas para realizar de manera ordenada,ten encuenta que las tareas no podrán repetirse con las acciones ya realizadas  y se ejecutarán en el orden establecido.El sistema no generará tareas adicionales o acciones que no correspodan a las tareas establecidas, simplemente seguirá el orden especificado.También se te proporcionarán el estado actual del DOM. También se te proporcionarán tareas anteriores que has realizado que no deberán repetirse. Puedes intentar nuevamente una acción fallida hasta una vez.

Este es un ejemplo de tareas a realizar de forma ordenada en lenguaje Gherkin:

<Thought>Escenario: Registro en la web</Thought>
<Thought>  Dado que estoy en la página de registro</Thought>
<Action>  // Acción específica para navegar a la página de registro</Action>

<Thought>  Cuando completo los siguientes pasos:</Thought>
<Thought>    | Campo              | Valor                   |</Thought>
<Thought>    | Email              | at.nttdata+30@gmail.com |</Thought>
<Thought>    | Contraseña         | Inicio00                |</Thought>
<Action>    // Acción específica para completar los pasos</Action>

<Thought>  Entonces debería estar en la página de perfil</Thought>
<Action>  // Acción específica para verificar que se ha llegado a la página de perfil</Action>

En este ejemplo, se utiliza el formato de lenguaje Gherkin para describir el escenario de registro en la web. Las instrucciones se presentan como pasos en Gherkin, comenzando con palabras clave como "Dado", "Cuando" y "Entonces". Puedes personalizar los pasos y agregar más según tus necesidades.

Este es un ejemplo de una acción:

<Thought>Debo hacer clic en el botón "Agregar al carrito"</Thought>
<Action>click(223)</Action>

Siempre debes incluir las etiquetas de apertura y cierre <Thought> y <Action>, de lo contrario, tu respuesta se marcará como inválida.`;
*/

/*const systemMessage = `
Eres un asistente de automatización de navegador.

Puedes utilizar las siguientes herramientas:

${formattedActions}

Se te dará una tarea para realizar en forma ordenada y el estado actual del DOM del cual solo podras realizar acciones de acuerdo al contenido del DOM actual. También se te proporcionarán acciones anteriores que has tomado. Puedes volver a intentar una acción fallida hasta una vez.

Este es un ejemplo de una acción:

<Thought>Debo hacer clic en el botón "Agregar al carrito"</Thought>
<Action>click(223)</Action>

Siempre retornaras una solo acción por cada petición.
Siempre retornaras <Thought> y <Action>.
Siempre debes incluir las etiquetas de apertura y cierre <Thought> y <Action>, de lo contrario, tu respuesta se marcará como inválida.`;
*/
const systemMessage = `
Eres un asistente de automatización de navegador.

Puedes utilizar las siguientes herramientas:

${formattedActions}

Se te dará una tarea para realizar en forma ordenada y el estado actual del DOM de modo que solo podrás realizar acciones de acuerdo al contenido del DOM actual de lo contrario tu respuesta se marcará como inválida.  
Se te proporcionará un historial de acciones anteriores de modo que no podrás generar acciones que ya se realizaron de lo contrario tu respuesta se marcará como inválida.
Puedes volver a intentar una acción fallida hasta una vez.
No podrás usar comillas ni caracteres especiales en tu respuesta de lo contrario tu respuesta se marcará como inválida.
Si las acciones son iguales a las tareas, se indicara que la tarea se ha completado.

Este es un ejemplo de una acción:

<Thought>Debo hacer clic en el botón "Agregar al carrito"</Thought>
<Action>click(223)</Action>

Solo podrás retorna una sola acción de lo contrario tu respuesta se marcará como inválida.
Solo podrás retorna la acción al orden establecido por la tarea de lo contrario tu respuesta se marcará como inválida.
Solo podrás retornar acciones que se puedan ejecutar con el contenido actual de la página de lo contrario tu respuesta se marcará como inválida.
Siempre retornaras <Thought> y <Action>.
Siempre debes incluir las etiquetas de apertura y cierre <Thought> y <Action>, de lo contrario, tu respuesta se marcará como inválida.`

export async function determineNextAction(
  taskInstructions: string,
  previousActions: ParsedResponseSuccess[],
  simplifiedDOM: string,
  maxAttempts = 3,
  notifyError?: (error: string) => void
) {

  const model = useAppState.getState().settings.selectedModel;
  const prompt = formatPrompt(taskInstructions, previousActions, simplifiedDOM);
  const key = useAppState.getState().settings.openAIKey;

  console.log("promt: "+prompt);

  if (!key) {
    notifyError?.('No OpenAI key found');
    return null;
  }

  const openai = new OpenAIApi(
    new Configuration({
      apiKey: key,
    })
  );
  
  console.log("systemMessage: " + systemMessage);

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const completion = await openai.createChatCompletion({
        model: model,
        messages: [
          {
            role: 'system',
            content: systemMessage,
          },
          { role: 'user', content: prompt },
        ],
        max_tokens: 500,
        temperature: 0,
        stop: ['</Action>'],
      });

      const response = completion.data.choices[0].message?.content?.trim();
      if (response === 'End' || response === 'Finish') {
        // Finalizar la automatización
        return {
          usage: completion.data.usage as CreateCompletionResponseUsage,
          prompt,
          response: 'Automatización finalizada',
        };
      }

      return {
        usage: completion.data.usage as CreateCompletionResponseUsage,
        prompt,
        response:
          completion.data.choices[0].message?.content?.trim() + '</Action>',
      };
    } catch (error: any) {
      console.log('determineNextAction error', error);
      if (error.response.data.error.message.includes('server error')) {
        // Problem with the OpenAI API, try again
        if (notifyError) {
          notifyError(error.response.data.error.message);
        }
      } else {
        // Another error, give up
        throw new Error(error.response.data.error.message);
      }
    }
  }
  throw new Error(
    `Failed to complete query after ${maxAttempts} attempts. Please try again later.`
  );
}

export function formatPrompt(
  taskInstructions: string,
  previousActions: ParsedResponseSuccess[],
  pageContents: string
) {
  let previousActionsString = '';

  if (previousActions.length > 0) {
    const serializedActions = previousActions
      .map(
        (action) =>
          `<Thought>${action.thought}</Thought>\n<Action>${action.action}</Action>`
      )
      .join('\n\n');
    previousActionsString = `Ya realizaste las siguientes acciones: \n${serializedActions}\n\n`;
  }

  return `El usuario ha facilitado las siguientes tareas a realizar:

${taskInstructions}

${previousActionsString}

Tiempo actual: ${new Date().toLocaleString()}

Contenido de la página actual:
${pageContents}`;
}
