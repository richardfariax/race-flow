/** @type {import('next').NextConfig} */
const nextConfig = {
  // shared/ vive fora de web/ (usado também pelo server Colyseus); sem isso o
  // webpack não aplica o loader TS/SWC a esses arquivos e o build quebra com
  // "Module parse failed: Unexpected token" em qualquer import de @shared/*.
  experimental: {
    externalDir: true,
  },
};

export default nextConfig;
