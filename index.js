import {
  app,
  html,
  logger,
  recycler,
  classNames,
  delay,
  effect
} from './lib.js'

const BACK_CARD_PATH = './images/card_back.png'
const TABLE_SIZE = 6

const cardPath = index =>
  `./images/card_spade_${index.toString().padStart(2, '0')}.png`

const renderCard = (number, index, isFlip, isClear) => {
  return html`
    <div class="card" onclick="${() => emit(ACTION.clickFlip, { index })}">
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

const PAYLER = {
  YOU: 'you',
  AI: 'ai'
}

const FLIP_MATCHING_COUNT = 3

const initialState = () => {
  const singleTable = new Array(TABLE_SIZE).fill(0).map((_, i) => i + 1)
  const table = new Array(FLIP_MATCHING_COUNT)
    .fill(singleTable)
    .flat()
    .sort(() => Math.random() - 0.5)
  return {
    table,
    fliped: [],
    clear: [],
    playing: PAYLER.YOU,
    isSkipable: false
  }
}

const debugInitialState = () => {
  const singleTable = new Array(TABLE_SIZE).fill(0).map((_, i) => i + 1)
  const table = new Array(FLIP_MATCHING_COUNT)
    .fill(singleTable)
    .flat()
    .sort(() => Math.random() - 0.5)
  return {
    table,
    fliped: [],
    clear: new Array(TABLE_SIZE * FLIP_MATCHING_COUNT).fill(0).map((_, i) => i),
    playing: PAYLER.YOU,
    isSkipable: false
  }
}

const ACTION = {
  clickFlip: 'CLICK_FLIP',
  flip: 'FLIP',
  unflip: 'UNFLIP',
  reset: 'RESET',
  skip: 'SKIP'
}

const mutation = (state, action, payload) => {
  switch (action) {
    case ACTION.unflip:
      return { ...state, fliped: [] }
    case ACTION.flip:
      const { index } = payload
      if (state.fliped.length === FLIP_MATCHING_COUNT) {
        return { ...state, fliped: [index] }
      } else {
        if (state.fliped.includes(index)) {
          return state
        }
        const isSkipable =
          state.fliped.length === 1 &&
          state.table[state.fliped[0]] !== state.table[index]
        const isClear =
          state.fliped.length === FLIP_MATCHING_COUNT - 1 &&
          state.fliped
            .map(i => state.table[i])
            .every(v => v === state.table[index])
        const newClear = isClear
          ? [...state.clear, ...state.fliped, index]
          : state.clear
        return {
          ...state,
          fliped: isClear ? [] : [...state.fliped, index],
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

function* flipCycle(getState) {
  while (true) {
    const payload = yield effect.take(ACTION.clickFlip)
    yield effect.put(ACTION.flip, payload)
    if (getState().fliped.length === FLIP_MATCHING_COUNT) {
      yield effect.call(delay, 1000)
      yield effect.put(ACTION.unflip)
    }
  }
}

const { emit, use, run } = app(
  document.querySelector('#app'),
  initialState(),
  mutation,
  render
)

use(logger())
use(recycler(flipCycle))

run()
