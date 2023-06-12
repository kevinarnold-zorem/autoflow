import { Button, Input, VStack, Text, Link, HStack } from '@chakra-ui/react';
import React from 'react';
import { useAppState } from '../state/store';

const ModelDropdown = () => {
  const { updateSettings } = useAppState((state) => ({
    updateSettings: state.settings.actions.update,
  }));

  const [openAIKey, setOpenAIKey] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);

  return (
    <VStack spacing={4}>
      <Text fontSize="sm">
      Necesitará una clave API de OpenAI para ejecutar AutoFlow en modo desarrollador. Si usted
        no tiene uno disponible todavía, puedes crear uno en {' '}
        <Link
          href="https://platform.openai.com/account/api-keys"
          color="blue"
          isExternal
        >
          OpenAI account
        </Link>
        .
        <br />
        <br />
        AutoFlow almacena su clave API de forma local y segura, y solo se utiliza para
        comunicarse con la API de OpenAI.
      </Text>
      <HStack w="full">
        <Input
          placeholder="OpenAI API Key"
          value={openAIKey}
          onChange={(event) => setOpenAIKey(event.target.value)}
          type={showPassword ? 'text' : 'password'}
        />
        <Button
          onClick={() => setShowPassword(!showPassword)}
          variant="outline"
        >
          {showPassword ? 'Hide' : 'Show'}
        </Button>
      </HStack>
      <Button
        onClick={() => updateSettings({ openAIKey })}
        w="full"
        disabled={!openAIKey}
        colorScheme="blue"
      >
        Guardar API
      </Button>
    </VStack>
  );
};

export default ModelDropdown;
