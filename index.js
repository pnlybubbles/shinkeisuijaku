import { app, html, logger } from './lib.js'

const BACK_CARD_PATH = './images/card_back.png'
const TABLE_SIZE = 10

const cardPath = index =>
  `./images/card_spade_${index.toString().padStart(2, '0')}.png`

const renderCard = (emit, number, index, isFlip, isClear) => {
  return html`
    <div class="card" onclick="${() => emit(ACTION.flip, index)}">
      ${isFlip || isClear
        ? `<img class="card__img front" src="${cardPath(number)}" />`
        : `<img class="card__img back" src="${BACK_CARD_PATH}" />`}
      ${isClear ? `<div class='card__clear'></div>` : ``}
    </div>
  `
}

const renderClearModal = emit => html`
  <div class="modal">
    <div class="modal__window">
      <div class="modal__label">Clear!</div>
      <button class="modal__button" onclick=${() => emit(ACTION.reset)}>
        Reset
      </button>
    </div>
  </div>
`

const render = (emit, state) => {
  const isComplete = state.clear.length === state.table.length
  return html`
    <main class="root">
      <div class="${['root__table', isComplete ? 'complete' : ''].join(' ')}">
        ${state.table.map((v, i) =>
          renderCard(
            emit,
            v,
            i,
            state.fliped.includes(i),
            state.clear.includes(i)
          )
        )}
      </div>
      ${isComplete ? renderClearModal(emit) : ``}
    </main>
  `
}

const initialState = () => {
  const singleTable = new Array(TABLE_SIZE).fill(0).map((_, i) => i + 1)
  const table = singleTable.concat(singleTable).sort(() => Math.random() - 0.5)
  return {
    table,
    fliped: [],
    clear: []
  }
}

const debugInitialState = () => {
  const singleTable = new Array(TABLE_SIZE).fill(0).map((_, i) => i + 1)
  const table = singleTable.concat(singleTable).sort(() => Math.random() - 0.5)
  return {
    table,
    fliped: [],
    clear: new Array(TABLE_SIZE * 2).fill(0).map((_, i) => i)
  }
}

const ACTION = {
  flip: 'FLIP',
  reset: 'RESET'
}

const mutation = (state, action, args) => {
  switch (action) {
    case ACTION.flip:
      const index = args[0]
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

app(document.querySelector('#app'), initialState(), [logger], mutation, render)
