# MMR Proxy

Servidor intermediario para MMR Gestion.
Recibe peticiones de la app, llama a OpenAI con la clave secreta
(guardada en el servidor) y devuelve el resultado. Asi la clave
nunca viaja al movil del usuario.

## Variables de entorno (en Vercel)

- OPENAI_API_KEY : la clave secreta de OpenAI.
- APP_TOKEN : una contrasena inventada, larga y dificil, que la app
  envia en cada peticion para que solo tu app pueda usar el proxy.
