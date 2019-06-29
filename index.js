import { app, html, logger, classNames } from './lib.js'

const BACK_CARD_PATH = './images/card_back.png'
const TABLE_SIZE = 10

const cardPath = index =>
  `./images/card_spade_${index.toString().padStart(2, '0')}.png`

const renderCard = (number, index, isFlip, isClear) => {
  return html`
    <div class="card" onclick="${() => emit(ACTION.flip, { index })}">
      ${isFlip || isClear
        ? html`
            <img class="card__img front" src="${cardPath(number)}" />
          `
        : html`
            <img class="card__img back" src="${BACK_CARD_PATH}" />
          `}
      <div class="${classNames(['card__clear', { active: isClear }])}"></div>
    </div>
  `
}

const renderClearModal = () => html`
  <div class="modal">
    <div class="modal__window">
      <div class="modal__label">Clear!</div>
      <button class="modal__button" onclick=${() => emit(ACTION.reset)}>
        Reset
      </button>
    </div>
  </div>
`

const render = state => {
  const isComplete = state.clear.length === state.table.length
  return html`
    <main class="root">
      <div class="${['root__table', isComplete ? 'complete' : ''].join(' ')}">
        ${state.table.map((v, i) =>
          renderCard(v, i, state.fliped.includes(i), state.clear.includes(i))
        )}
      </div>
      ${isComplete ? renderClearModal() : ``}
    </main>
  `
}

const initialState = () => {
  const singleTable = new Array(TABLE_SIZE).fill(0).map((_, i) => i + 1)
  const table = singleTable.concat(singleTable).sort(() => Math.random() - 0.5)
  return {
    table,
    fliped: [],
    clear: [],
    busy: false
  }
}

const debugInitialState = () => {
  const singleTable = new Array(TABLE_SIZE).fill(0).map((_, i) => i + 1)
  const table = singleTable.concat(singleTable).sort(() => Math.random() - 0.5)
  return {
    table,
    fliped: [],
    clear: new Array(TABLE_SIZE * 2).fill(0).map((_, i) => i),
    busy: false
  }
}

const ACTION = {
  flip: 'FLIP',
  reset: 'RESET'
}

const mutation = (state, action, payload) => {
  switch (action) {
    case ACTION.flip:
      const { index } = payload
      if (state.fliped.length === 2) {
        return { ...state, fliped: [index] }
      } else {
        const prevIndex = state.fliped[0]
        if (prevIndex === index) {
          return state
        }
        const newClear =
          state.table[prevIndex] === state.table[index]
            ? [...state.clear, prevIndex, index]
            : state.clear
        return { ...state, fliped: [...state.fliped, index], clear: newClear }
      }
    case ACTION.reset:
      return initialState()
    default:
      return state
  }
}

const { emit, use, run } = app(
  document.querySelector('#app'),
  initialState(),
  mutation,
  render
)

use(logger)
run()
