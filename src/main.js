import './style.css'
import * as THREE from 'three'

// --- Image URL ---
const IMAGE_URL = 'images/1.jpeg';

// --- Scene Setup ---
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); // Fullscreen Quad
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// --- Uniforms ---
const uniforms = {
  uTime: { value: 0 },
  uTexture: { value: null },
  uMouse: { value: new THREE.Vector2(0.5, 0.5) },
  uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
  uImageResolution: { value: new THREE.Vector2(1, 1) },
  uHoverState: { value: 0 } // 0 = Decayed, 1 = Clean
};

// --- Shader ---
// "Pixel Sorting" look is achieved by sampling randomly along one axis based on brightness/noise
const vertexShader = `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
    }
`;

const fragmentShader = `
    uniform float uTime;
    uniform sampler2D uTexture;
    uniform vec2 uMouse;
    uniform vec2 uResolution;
    uniform vec2 uImageResolution;
    uniform float uHoverState;
    varying vec2 vUv;

    // Random / Noise functions
    float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
    }
    
    float noise(vec2 st) {
        vec2 i = floor(st);
        vec2 f = fract(st);
        float a = random(i);
        float b = random(i + vec2(1.0, 0.0));
        float c = random(i + vec2(0.0, 1.0));
        float d = random(i + vec2(1.0, 1.0));
        vec2 u = f*f*(3.0-2.0*f);
        return mix(a, b, u.x) + (c - a)* u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
    }

    void main() {
        // Correct aspect ratio logic (Cover)
        vec2 s = uResolution;
        vec2 i = uImageResolution;
        float rs = s.x / s.y;
        float ri = i.x / i.y;
        vec2 new = rs < ri ? vec2(i.x * s.y / i.y, s.y) : vec2(s.x, i.y * s.x / i.x);
        vec2 offset = (rs < ri ? vec2((new.x - s.x) / 2.0, 0.0) : vec2(0.0, (new.y - s.y) / 2.0)) / new;
        vec2 uv = vUv * s / new + offset;


        // -- DECAY LOGIC --
        
        // 1. Calculate "Distance" from mouse for interactive heal
        // We want a radius around mouse to be "Clean"
        float dist = distance(vUv, uMouse);
        float mouseMask = smoothstep(0.4, 0.1, dist); // 1.0 at center, 0.0 at edge
        
        // Combine hover state and mouse pos
        // Or just use mouse mask as the main driver
        float healFactor = mouseMask;
        
        // 2. Generate Sorting/Shift offset
        // We scan "down" (y-axis) or "right" (x-axis)
        // High frequency noise for the "sorted lines" look
        float sortNoise = noise(vec2(uv.y * 100.0, uTime * 0.5)); 
        
        // Intensity of the glitch
        // If healFactor is 1 (Clean), intensity is 0.
        float intensity = (1.0 - healFactor) * 0.5; // Max shift amount
        
        // Shift X based on brightness/noise
        // We fetch a 'control' pixel to decide how much to shift
        float shift = (sortNoise - 0.5) * intensity;
        
        // Apply shift only to X for horizontal sorting look
        vec2 distortedUV = uv + vec2(shift, 0.0);
        
        // 3. Chromatic Aberration (RGB Split)
        float rgbSplit = intensity * 0.02;
        
        float r = texture2D(uTexture, distortedUV + vec2(rgbSplit, 0.0)).r;
        float g = texture2D(uTexture, distortedUV).g;
        float b = texture2D(uTexture, distortedUV - vec2(rgbSplit, 0.0)).b;
        
        // 4. Scanline / Grid effect for extra "Digital" feel
        float scanline = sin(uv.y * 800.0) * 0.1 * (1.0 - healFactor);
        
        vec3 color = vec3(r, g, b) - scanline;
        
        // Darken the decayed parts slightly
        color *= mix(0.5, 1.0, healFactor);

        gl_FragColor = vec4(color, 1.0);
    }
`;

// --- Init ---
const geometry = new THREE.PlaneGeometry(2, 2);
const material = new THREE.ShaderMaterial({
  vertexShader,
  fragmentShader,
  uniforms
});
const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

// --- Load Image ---
new THREE.TextureLoader().load(IMAGE_URL, (tex) => {
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  uniforms.uTexture.value = tex;
  uniforms.uImageResolution.value.set(tex.image.width, tex.image.height);
});

// --- Events ---
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
});

window.addEventListener('mousemove', (e) => {
  // Correct mouse coords to 0..1, flip Y
  uniforms.uMouse.value.set(
    e.clientX / window.innerWidth,
    1.0 - (e.clientY / window.innerHeight)
  );
});

// --- Loop ---
const clock = new THREE.Clock();
function animate() {
  uniforms.uTime.value = clock.getElapsedTime();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();


// --- Menu Logic ---
const menuBtn = document.getElementById('menu-btn');
const menuOverlay = document.getElementById('menu-overlay');
let isMenuOpen = false;

menuBtn.addEventListener('click', () => {
  isMenuOpen = !isMenuOpen;

  if (isMenuOpen) {
    menuOverlay.classList.add('active');
    menuBtn.querySelector('.btn-text').textContent = 'CLOSE';
  } else {
    menuOverlay.classList.remove('active');
    menuBtn.querySelector('.btn-text').textContent = 'SYSTEM';
  }
});

// Update Mouse Event to respect Menu State
window.addEventListener('mousemove', (e) => {
  uniforms.uMouse.value.set(
    e.clientX / window.innerWidth,
    1.0 - (e.clientY / window.innerHeight)
  );

  if (isMenuOpen) {
    // If Menu is open, we send the "Mouse" far away so the screen is fully decayed
    // The shader logic says: Distance from mouse = Decay.
    // So moving mouse off-screen = Full Decay.
    uniforms.uMouse.value.set(10.0, 10.0);
  }
});
