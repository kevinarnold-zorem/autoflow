import axios, { AxiosError } from 'axios';

const baseURL = 'http://localhost:4000'; // URL base de la API

interface JsonRequest {
  Thought: string;
  Action: string;
  Dom: string;
}

// Función para agregar un nuevo step con una imagen en base64 a un proyecto
export async function addStepToGenerator(thought: string, action: string, dom: string): Promise<void> {
  try {
    // Reemplazar comillas dobles por comillas simples en las cadenas
    const modifiedThought = thought.replace(/"/g, "'");
    const modifiedAction = action.replace(/"/g, "'");
    const modifiedDom = dom.replace(/"/g, "'");

    const jsonData: JsonRequest = {
      Thought: modifiedThought,
      Action: modifiedAction,
      Dom: modifiedDom
    };

    const response = await axios.post(`${baseURL}/api/steps`, jsonData);

    console.log(response.data);
    
  } catch (error: unknown) {
    const axiosError = error as AxiosError;
    if (axiosError.response) {
      console.error('Error al agregar el step al Generador :', axiosError.response.data.error);
    } else {
      console.error('Error al agregar el step al Generador:', axiosError.message);
    }
  }
}
