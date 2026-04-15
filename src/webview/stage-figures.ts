// ── Claude Stage – figure management, animation & bubbles ────────────────────

// ── Figure management ─────────────────────────────────────────────────────────

function buildFigure(id: string, role: string, label: string): HTMLElement {
  const el = document.createElement('div');
  el.className  = `figure ${role}`;
  el.dataset.id = id;

  const wrap = document.createElement('div');
  wrap.className = 'sprite-wrap';

  const canvas = document.createElement('canvas');
  canvas.className = 'sprite';
  // Size set after renderer is created in ensureFigure
  wrap.appendChild(canvas);

  const shadow = document.createElement('div');
  shadow.className = 'shadow';

  const labelEl = document.createElement('div');
  labelEl.className   = 'label';
  labelEl.textContent = label;

  const stateEl = document.createElement('div');
  stateEl.className   = 'state-label';
  stateEl.textContent = 'idle';

  el.appendChild(wrap);
  el.appendChild(shadow);
  el.appendChild(labelEl);
  el.appendChild(stateEl);
  return el;
}

function placeFigure(el: HTMLElement, slot: Slot): void {
  el.style.left      = slot.x + '%';
  el.style.top       = slot.y + '%';
  el.style.transform = 'translate(-50%, -100%)';
}

/** Smoothly slide an existing figure to a new slot (CSS left/top transition). */
function moveFigure(fig: Figure, slot: Slot): void {
  fig.slot          = slot;
  fig.el.style.left = slot.x + '%';
  fig.el.style.top  = slot.y + '%';
}

function ensureFigure(id: string, role: string, label: string, slot: Slot): Figure {
  if (!figures.has(id)) {
    const el       = buildFigure(id, role, label);
    const canvas   = el.querySelector<HTMLCanvasElement>('.sprite')!;
    const renderer = createSpriteRenderer(role, artStyle, spritesBaseUrl);
    canvas.width   = renderer.canvasW;
    canvas.height  = renderer.canvasH;
    const ctx      = canvas.getContext('2d')!;
    placeFigure(el, slot);
    figuresLayer.appendChild(el);
    const stateEl = el.querySelector<HTMLElement>('.state-label') ?? undefined;
    const fig: Figure = { el, canvas, ctx, renderer, role, state: 'idle', frameIdx: 0, slot, stateEl };
    figures.set(id, fig);
    startAnim(fig);
  }
  return figures.get(id)!;
}

function removeFigureAnimated(id: string, delay = 0): void {
  const fig = figures.get(id);
  if (!fig) return;
  setTimeout(() => {
    fig.el.style.animation = 'fadeOut 0.5s forwards';
    setTimeout(() => {
      if (fig.timer !== undefined) clearTimeout(fig.timer);
      fig.el.remove();
      figures.delete(id);
    }, 500);
  }, delay);
}

// ── Animation ─────────────────────────────────────────────────────────────────

function startAnim(fig: Figure): void {
  if (fig.timer !== undefined) clearTimeout(fig.timer);
  fig.frameIdx = 0;
  function tick(): void {
    const state = fig.state;
    fig.renderer.draw(fig.ctx, state, fig.frameIdx % fig.renderer.frameCount(state));
    fig.frameIdx++;
    fig.timer = window.setTimeout(tick, fig.renderer.ms(state));
  }
  tick();
}

function setState(fig: Figure, state: string): void {
  fig.state = state;
  fig.el.classList.toggle('spawning', state === 'spawning');
  if (fig.stateEl) fig.stateEl.textContent = state;
  startAnim(fig);
}

// ── Bubbles ───────────────────────────────────────────────────────────────────

function showBubble(fig: Figure, text: string, isThought = false): void {
  clearBubble(fig);
  const bubble = document.createElement('div');
  bubble.className   = isThought ? 'thought-bubble' : 'bubble';
  bubble.textContent = text;
  fig.el.querySelector('.sprite-wrap')!.appendChild(bubble);
  fig.bubble = bubble;
}

function clearBubble(fig: Figure): void {
  fig.el.querySelector('.bubble, .thought-bubble')?.remove();
  fig.bubble = null;
}

// ── Flash ─────────────────────────────────────────────────────────────────────

function flashFigure(fig: Figure, success: boolean): void {
  const wrap = fig.el.querySelector<HTMLElement>('.sprite-wrap')!;
  wrap.style.animation = success
    ? 'successFlash 0.6s ease-out'
    : 'errorShake 0.5s ease-out';
  setTimeout(() => { wrap.style.animation = ''; }, 700);
}
