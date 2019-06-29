import { app, html, logger, classNames } from './lib.js'

const BACK_CARD_PATH = './images/card_back.png'
const TABLE_SIZE = 6

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
      <button
        class="${classNames([
          'root__skip-button',
          { active: state.isSkipable }
        ])}"
        onclick=${() => emit(ACTION.skip)}
      >
        Skip
      </button>
      ${isComplete ? renderClearModal() : ``}
    </main>
  `
}

const initialState = () => {
  const singleTable = new Array(TABLE_SIZE).fill(0).map((_, i) => i + 1)
  const table = singleTable
    .concat(singleTable)
    .concat(singleTable)
    .sort(() => Math.random() - 0.5)
  return {
    table,
    fliped: [],
    clear: [],
    busy: false,
    isSkipable: false
  }
}

const debugInitialState = () => {
  const singleTable = new Array(TABLE_SIZE).fill(0).map((_, i) => i + 1)
  const table = singleTable.concat(singleTable).sort(() => Math.random() - 0.5)
  return {
    table,
    fliped: [],
    clear: new Array(TABLE_SIZE * 2).fill(0).map((_, i) => i),
    busy: false,
    isSkipable: false
  }
}

const ACTION = {
  flip: 'FLIP',
  reset: 'RESET',
  skip: 'SKIP'
}

const mutation = (state, action, payload) => {
  switch (action) {
    case ACTION.flip:
      const { index } = payload
      if (state.fliped.length === 3) {
        return { ...state, fliped: [index] }
      } else {
        if (state.fliped.includes(index)) {
          return state
        }
        const isSkipable =
          state.fliped.length === 1 &&
          state.table[state.fliped[0]] !== state.table[index]
        const newClear =
          state.fliped.length === 2 &&
          state.fliped
            .map(i => state.table[i])
            .every(v => v === state.table[index])
            ? [...state.clear, ...state.fliped, index]
            : state.clear
        return {
          ...state,
          fliped: [...state.fliped, index],
          clear: newClear,
          isSkipable
        }
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
