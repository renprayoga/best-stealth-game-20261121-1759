// Neon Shadow — keyboard + mouse input, kept apart from the simulation.
// Keys are read as a held set; the game loop polls it every step. Clicks on
// the canvas become click-to-move targets (converted to field coordinates by
// the caller, which knows the canvas scale).
export function createInput() {
  const keys = new Set();
  const state = { up: false, down: false, left: false, right: false, sprint: false };
  let clickHandler = null;

  const KEYMAP = {
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ShiftLeft: 'sprint', ShiftRight: 'sprint',
  };

  function refresh() {
    state.up = keys.has('up');
    state.down = keys.has('down');
    state.left = keys.has('left');
    state.right = keys.has('right');
    state.sprint = keys.has('sprint');
  }

  function onKeyDown(event) {
    const action = KEYMAP[event.code];
    if (action) {
      keys.add(action);
      refresh();
      event.preventDefault();
      return true;
    }
    return false;
  }

  function onKeyUp(event) {
    const action = KEYMAP[event.code];
    if (action) {
      keys.delete(action);
      refresh();
    }
  }

  function onBlur() {
    keys.clear();
    refresh();
  }

  function attach(canvas) {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    canvas.addEventListener('pointerdown', (event) => {
      if (clickHandler) clickHandler(event);
    });
  }

  return {
    state,
    attach,
    onClick(handler) { clickHandler = handler; },
  };
}
