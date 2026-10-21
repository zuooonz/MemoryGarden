// 后期效果（画面精修 09-27）：泛光（亮处微微晕开）＋微缩景深（画面上下边缘轻微虚化，像拍精致的小镇模型）。
// **只在不读雾的时刻开**（开场、标题画面；静观是让人细看小镇的，保持清楚、不开）——布置、白天走路时玩家要读雾，一律直接渲染（信息优先、美化让路）；
// 只在“标准”“精美”画质开（流畅档省性能）。第一次需要时才建，平时零开销。
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { HorizontalTiltShiftShader } from 'three/addons/shaders/HorizontalTiltShiftShader.js';
import { VerticalTiltShiftShader } from 'three/addons/shaders/VerticalTiltShiftShader.js';
import { VignetteShader } from 'three/addons/shaders/VignetteShader.js';
import { renderer, scene, camera } from './core.js';

let composer = null, bloom = null, hts = null, vts = null, vig = null, sizeKey = '';
function build() {
  // 中间图用 4 倍多重采样：不开的话边缘发毛、看着像分辨率低了（用户 09-27 在静观里发现）
  composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType }));
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.28, 0.5, 0.93); composer.addPass(bloom);   // 起点 0.93：只让太阳、灯、最亮的高光晕开，白雾基本不参与（雾不能糊成一团）
  hts = new ShaderPass(HorizontalTiltShiftShader); vts = new ShaderPass(VerticalTiltShiftShader);
  hts.uniforms.r.value = vts.uniforms.r.value = 0.5; composer.addPass(hts); composer.addPass(vts);
  vig = new ShaderPass(VignetteShader); vig.uniforms.offset.value = 0.95; vig.uniforms.darkness.value = 1.25; composer.addPass(vig);   // 暗角：只在晚上讲往事时开，把视线聚到亮着的家里
  composer.addPass(new OutputPass());
}
// want：这一帧是不是“看风景”的时刻；tier：当前画质档
// glow：晚上讲往事时（不读雾），门槛放低、光晕加强，让亮着的窗户和路灯晕开，加暗角（09-29，参考《鹈鹕骑单车》夜景的柔光）。标题画面试过：夕阳被晕成白团、暗角让四角发脏，不用
export function renderFrame(want, tier, glow = false) {
  if (!want || tier < 2) { renderer.render(scene, camera); return; }
  if (!composer) build();
  bloom.threshold = glow ? 0.58 : 0.93; bloom.strength = glow ? 0.8 : 0.28; bloom.radius = glow ? 0.7 : 0.5; vig.enabled = glow;
  const size = renderer.getSize(new THREE.Vector2()), pr = renderer.getPixelRatio(), key = `${size.x}x${size.y}@${pr}`;
  if (key !== sizeKey) { sizeKey = key; composer.setPixelRatio(pr); composer.setSize(size.x, size.y); hts.uniforms.h.value = 0.9 / size.x; vts.uniforms.v.value = 0.9 / size.y; }   // 景深减轻：只让最上最下略柔
  composer.render();
}
