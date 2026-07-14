import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { PerspectiveCamera } from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/**
 * Profundidade de campo sutil: o carro e a pista próxima (~8,5–50 m da câmera)
 * ficam nítidos; o cenário distante borra de leve, crescendo até ~350 m+.
 *
 * Matemática do BokehShader: blur = clamp((focus + viewZ) * aperture, ±maxblur),
 * viewZ ≤ 0 em metros. Logo focus = distância do plano em foco (≈ distância do
 * carro) e aperture minúsculo p/ um foco largo (senão o carro, mais perto que o
 * foco, borraria). BokehPass do próprio three (sem dep nova); OutputPass reaplica
 * o tone mapping/sRGB que o RenderPass, indo a um alvo intermediário, não faz.
 *
 * Assume o loop de render (useFrame priority=1). Se qualquer etapa falhar, cai
 * no render normal — o jogo nunca fica preto por causa do efeito.
 */
export function PostFX() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const failed = useRef(false);
  const bokehRef = useRef<BokehPass | null>(null);

  const composer = useMemo(() => {
    try {
      const c = new EffectComposer(gl);
      c.addPass(new RenderPass(scene, camera));
      // focus ~ distância do carro; aperture minúsculo = foco largo, longe borra suave
      const bokeh = new BokehPass(scene, camera, { focus: 12, aperture: 0.000015, maxblur: 0.006 });
      bokehRef.current = bokeh;
      c.addPass(bokeh);
      c.addPass(new OutputPass());
      return c;
    } catch {
      failed.current = true;
      return null;
    }
  }, [gl, scene, camera]);

  useEffect(() => {
    if (!composer) return;
    composer.setPixelRatio(gl.getPixelRatio());
    composer.setSize(size.width, size.height);
    // mantém o aspect do bokeh coerente com a janela (blur uniforme)
    const bokeh = bokehRef.current;
    const cam = camera as PerspectiveCamera;
    if (bokeh && cam.isPerspectiveCamera) {
      // @types/three tipa uniforms como {} — fronteira mínima p/ o uniform aspect
      const u = bokeh.uniforms as Record<string, { value: number }>;
      u['aspect'].value = cam.aspect;
    }
  }, [composer, gl, camera, size.width, size.height]);

  useEffect(() => () => composer?.dispose(), [composer]);

  useFrame((_, dt) => {
    if (composer && !failed.current) {
      try {
        composer.render(dt);
        return;
      } catch {
        failed.current = true; // desliga o efeito e segue no render normal
      }
    }
    // fallback: o composer deixa autoClear=false; restaura p/ o render direto
    gl.autoClear = true;
    gl.render(scene, camera);
  }, 1);

  return null;
}
