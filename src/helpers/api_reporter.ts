import axios, { AxiosError } from 'axios';

const baseURL = 'http://localhost:3000'; // URL base de la API

// Función para agregar un nuevo step con una imagen en base64 a un proyecto
export async function addStepToReport(project: string, step: string, imageBase64: string): Promise<void> {
  try {
    const response = await fetch(`${baseURL}/api/steps/${project}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ step, imageBase64 }),
    });

    if (!response.ok) {
      throw new Error('Error al agregar el step');
    }

    console.log(response);
  } catch (error: unknown) {
    console.error('Error al agregar el step:', error);
  }
}

export type ReportResponse = {
  message: string;
  fileUrl: string;
};

// Función para generar el reporte de un proyecto
export async function generateReport(project: string): Promise<ReportResponse> {
  try {
    const response = await axios.get(`${baseURL}/api/generate/${project}`);
    const { message, fileUrl } = response.data;
    console.log(message);
    console.log('Enlace del archivo:', fileUrl);

    return {
      message: message,
      fileUrl: fileUrl,
    };
  } catch (error: unknown) {
    const axiosError = error as AxiosError;
    if (axiosError.response) {
      console.error('Error al generar el reporte:', axiosError.response.data.error);
    } else {
      console.error('Error al generar el reporte:', axiosError.message);
    }

    throw error;
  }
}
