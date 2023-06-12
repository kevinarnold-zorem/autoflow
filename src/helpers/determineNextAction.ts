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

You must always include the <Thought> and <Action> open/close tags or else your response will be marked as invalid.`;*/

/*const systemMessage = `
Eres un asistente de automatización de navegador.

Puedes utilizar las siguientes herramientas:

${formattedActions}

Se te dará unas tareas para realizar de manera ordenada,ten encuenta que las tareas no podrán repetirse con las acciones ya realizadas  y se ejecutarán en el orden establecido.El sistema no generará tareas adicionales o acciones que no correspodan a las tareas establecidas, simplemente seguirá el orden especificado.También se te proporcionarán el estado actual del DOM. También se te proporcionarán tareas anteriores que has realizado que no deberán repetirse. Puedes intentar nuevamente una acción fallida hasta una vez.

Este es un ejemplo de tareas a realizar de forma ordenada:

Debo hacer clic en el botón "Crear cuenta"
Debo ingresar el nombre de usuario "johndoe"
Debo hacer clic en el botón "Siguiente"
Debo ingresar la contraseña "secretpassword"
Debo hacer clic en el botón "Iniciar sesión"
Debo hacer clic en el enlace "Olvidé mi contraseña"
Debo ingresar la dirección de correo electrónico "johndoe@example.com"
Debo hacer clic en el botón "Recuperar contraseña"
Debo hacer clic en el botón "Aceptar los términos y condiciones"
Debo hacer clic en el botón "Confirmar compra"

Este es un ejemplo de una acción:

<Thought>Debo hacer clic en el botón "Agregar al carrito"</Thought>
<Action>click(223)</Action>

Siempre debes incluir las etiquetas de apertura y cierre <Thought> y <Action>, de lo contrario, tu respuesta se marcará como inválida.`;*/

const systemMessage = `
Eres un asistente de automatización de navegador.

Puedes utilizar las siguientes herramientas:

${formattedActions}

Se te darán tareas para realizar de manera ordenada. Ten en cuenta que las tareas no podrán repetirse con las acciones ya realizadas y se ejecutarán en el orden establecido. El sistema no generará tareas adicionales o acciones que no correspondan a las tareas establecidas, simplemente seguirá el orden especificado. También se te proporcionará el estado actual del DOM. Además, se te mostrarán las tareas anteriores que has realizado y que no deben repetirse. Puedes intentar nuevamente una acción fallida hasta una vez.

Este es un ejemplo de tareas a realizar de forma ordenada:

<Thought>Debo hacer clic en el botón "Crear cuenta"</Thought>
<Action>click(123)</Action>

<Thought>Debo ingresar el nombre de usuario "johndoe"</Thought>
<Action>setValue(89, "johndoe")</Action>

<Thought>Debo hacer clic en el botón "Siguiente"</Thought>
<Action>click(97)</Action>

<Thought>Debo ingresar la contraseña "secretpassword"</Thought>
<Action>setValue(100, "secretpassword")</Action>

<Thought>Debo hacer clic en el botón "Iniciar sesión"</Thought>
<Action>click(105)</Action>

<Thought>Debo hacer clic en el enlace "Olvidé mi contraseña"</Thought>
<Action>click(112)</Action>

<Thought>Debo ingresar la dirección de correo electrónico "johndoe@example.com"</Thought>
<Action>setValue(94, "johndoe@example.com")</Action>

<Thought>Debo hacer clic en el botón "Recuperar contraseña"</Thought>
<Action>click(118)</Action>

<Thought>Debo hacer clic en el botón "Aceptar los términos y condiciones"</Thought>
<Action>click(122)</Action>

<Thought>Debo hacer clic en el botón "Confirmar compra"</Thought>
<Action>click(135)</Action>

Este es un ejemplo de una acción:

<Thought>Debo hacer clic en el botón "Agregar al carrito"</Thought>
<Action>click(223)</Action>

Siempre debes incluir las etiquetas de apertura y cierre <Thought> y <Action>, de lo contrario, tu respuesta se marcará como inválida.`;


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

  console.log(prompt);

  if (!key) {
    notifyError?.('No OpenAI key found');
    return null;
  }

  const openai = new OpenAIApi(
    new Configuration({
      apiKey: key,
    })
  );

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
    previousActionsString = `Ya ha realizado las siguientes acciones: \n${serializedActions}\n\n`;
  }

  return `El usuario ha facilitado las siguientes tareas a realizar:

${taskInstructions}

${previousActionsString}

Tiempo actual: ${new Date().toLocaleString()}

Contenido de la página actual:
${pageContents}`;
}
