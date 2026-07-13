/** @type {import('next').NextConfig} */
const nextConfig = {
  // shared/ vive fora de web/ (usado também pelo server Colyseus); sem isso o
  // webpack não aplica o loader TS/SWC a esses arquivos e o build quebra com
  // "Module parse failed: Unexpected token" em qualquer import de @shared/*.
  experimental: {
    externalDir: true,
    // reduz pico de memória do build (troca velocidade por RAM) — bundle
    // pesado (three.js/rapier/colyseus) estoura a build machine free da Vercel.
    webpackMemoryOptimizations: true,
    cpus: 1,
  },
};

export default nextConfig;
