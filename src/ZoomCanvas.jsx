import React, {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {continueRender, delayRender} from 'remotion';

/**
 * Camera motion blur for the zoom, done on the GPU.
 *
 * Why not <CameraMotionBlur>? It stacks N DOM layers at opacity 1/N, and the browser
 * rounds every layer to 8 bits, so the rounding errors add up to visible contour
 * banding in the smooth, defocused gradients of this video (worse with more samples).
 * Here each pixel averages N sub-frame samples of the zoom in 32-bit float inside the
 * fragment shader, then is dithered by +-1 LSB once at the very end, so there is no
 * banding at all. The photo is also sampled with trilinear mipmaps, so the settled 1x
 * frame (a 4096px photo shown at ~2000px) stays crisp instead of aliasing.
 *
 * Geometry is identical to the DOM path: the photo is object-fit:cover in a frame-sized
 * box, transformed by translate(tx,ty) scale(s) with origin 0 0 (see zoomCamera()).
 * The canvas is oversized by a margin so the CSS defocus blur never fades at the card edge.
 */

const MAX_SAMPLES = 24;

const VS = `#version 300 es
in vec2 aPos;
out vec2 vF;
uniform vec4 uRect; // frame-space (card = 0..1) left, top, right, bottom of the canvas
void main() {
  vec2 a = aPos * 0.5 + 0.5;
  vF = vec2(mix(uRect.x, uRect.z, a.x), mix(uRect.w, uRect.y, a.y));
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
in vec2 vF;
out vec4 o;
uniform sampler2D uTex;
uniform vec3 uCam[${MAX_SAMPLES}]; // per sub-frame: scale, tx, ty
uniform int uN;
uniform vec4 uExt; // photo extents under object-fit:cover: X0, Y0, X1, Y1
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
void main() {
  vec3 acc = vec3(0.0);
  for (int i = 0; i < ${MAX_SAMPLES}; i++) {
    if (i >= uN) break;
    vec3 c = uCam[i];
    vec2 lf = (vF - c.yz) / c.x;                    // frame-local coords of the photo layer
    vec2 t = (lf - uExt.xy) / (uExt.zw - uExt.xy);  // -> photo texture coords
    // -0.4 LOD bias: matches the crispness of the browser's own downscale at 1x
    acc += texture(uTex, t, -0.4).rgb;
  }
  acc /= float(uN);
  // triangular dither, +-1 LSB, static per pixel (compresses well)
  float d = ign(gl_FragCoord.xy) + ign(gl_FragCoord.xy + vec2(47.0, 19.0)) - 1.0;
  o = vec4(acc + d / 255.0, 1.0);
}`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) || 'shader compile failed');
  return sh;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error(`image failed: ${src}`));
    im.src = src;
  });
}

/**
 * @param src    photo URL (raster)
 * @param cams   flat [scale, tx, ty, ...] one triple per motion-blur sample (<= 24)
 * @param ext    {X0, Y0, X1, Y1} photo extents in frame space (coverExtents)
 * @param sigma  screen-space defocus blur in px (CSS blur radius)
 * @param onFail called once if WebGL2 / the photo can't be used, so the parent can fall back
 */
export function ZoomCanvas({src, cams, ext, sigma, onFail}) {
  const canvasRef = useRef(null);
  const gfx = useRef(null);
  const released = useRef(false);
  const [ready, setReady] = useState(false);
  const [handle] = useState(() => delayRender(`zoom-gl ${src}`));

  const release = () => {
    if (!released.current) {
      released.current = true;
      continueRender(handle);
    }
  };

  useEffect(() => {
    let dead = false;
    let g = null;
    (async () => {
      try {
        const cv = canvasRef.current;
        const gl = cv.getContext('webgl2', {
          alpha: false,
          antialias: false,
          depth: false,
          stencil: false,
          preserveDrawingBuffer: true,
        });
        if (!gl) throw new Error('WebGL2 unavailable');
        const prog = gl.createProgram();
        gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS));
        gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FS));
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'link failed');
        gl.useProgram(prog);

        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const aPos = gl.getAttribLocation(prog, 'aPos');
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

        const img = await loadImage(src);
        if (dead) return;
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
        if (aniso) {
          gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
        }
        gl.uniform1i(gl.getUniformLocation(prog, 'uTex'), 0);

        g = {
          gl,
          uRect: gl.getUniformLocation(prog, 'uRect'),
          uCam: gl.getUniformLocation(prog, 'uCam'),
          uN: gl.getUniformLocation(prog, 'uN'),
          uExt: gl.getUniformLocation(prog, 'uExt'),
        };
        gfx.current = g;
        setReady(true);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[ZoomCanvas] falling back to DOM zoom (no motion blur):', e && e.message);
        if (!dead) onFail && onFail();
        release();
      }
    })();
    return () => {
      dead = true;
      gfx.current = null;
      if (g) {
        const lose = g.gl.getExtension('WEBGL_lose_context');
        if (lose) lose.loseContext();
      }
      release();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  // Draw on every render (every frame): the cams change with time.
  useLayoutEffect(() => {
    const g = gfx.current;
    const cv = canvasRef.current;
    if (!ready || !g || !cv) return;
    const {gl} = g;
    const host = cv.parentElement;
    const W = host.clientWidth;
    const H = host.clientHeight;
    if (!W || !H) return;

    const dpr = window.devicePixelRatio || 1;
    const quant = (v) => Math.ceil(v / 16) * 16;
    const mx = Math.min(quant(3 * sigma), Math.floor(0.3 * W));
    const my = Math.min(quant(3 * sigma), Math.floor(0.3 * H));
    const cw = W + 2 * mx;
    const ch = H + 2 * my;
    cv.style.left = `${-mx}px`;
    cv.style.top = `${-my}px`;
    cv.style.width = `${cw}px`;
    cv.style.height = `${ch}px`;
    const bw = Math.round(cw * dpr);
    const bh = Math.round(ch * dpr);
    if (cv.width !== bw || cv.height !== bh) {
      cv.width = bw;
      cv.height = bh;
    }
    gl.viewport(0, 0, bw, bh);

    const n = Math.max(1, Math.min(MAX_SAMPLES, Math.floor(cams.length / 3)));
    const padded = new Float32Array(MAX_SAMPLES * 3);
    padded.set(cams.slice(0, n * 3));
    gl.uniform4f(g.uRect, -mx / W, -my / H, 1 + mx / W, 1 + my / H);
    gl.uniform3fv(g.uCam, padded);
    gl.uniform1i(g.uN, n);
    gl.uniform4f(g.uExt, ext.X0, ext.Y0, ext.X1, ext.Y1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    release();
  });

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: '100%',
        height: '100%',
        display: 'block',
        filter: sigma > 0.3 ? `blur(${sigma}px)` : 'none',
      }}
    />
  );
}
