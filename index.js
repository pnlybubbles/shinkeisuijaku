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

const isComplete = clear =>
  Object.values(clear).flat().length === TABLE_SIZE * FLIP_MATCHING_COUNT

const render = ({ clear, fliped, table, isSkipable }) => {
  const isComp = isComplete(clear)
  const isFlip = i => fliped.includes(i)
  const isClear = i =>
    Object.values(clear)
      .flat()
      .includes(i)
  return html`
    <main class="root">
      <div class="${classNames(['root__table', { complete: isComp }])}">
        ${table.map((v, i) => renderCard(v, i, isFlip(i), isClear(i)))}
      </div>
      <button
        class="${classNames(['root__skip-button', { active: isSkipable }])}"
        onclick=${() => emit(ACTION.skip)}
      >
        Skip
      </button>
      ${isComp ? renderClearModal() : ``}
    </main>
  `
}

const PLAYER = {
  YOU: 'YOU',
  AI: 'AI'
}

const FLIP_MATCHING_COUNT = 2

const range = (offset, size) =>
  new Array(size).fill(0).map((_, i) => offset + i)

const initialState = () => {
  const singleTable = range(1, TABLE_SIZE)
  const table = new Array(FLIP_MATCHING_COUNT)
    .fill(singleTable)
    .flat()
    .sort(() => Math.random() - 0.5)
  return {
    table,
    fliped: [],
    clear: Object.fromEntries(Object.values(PLAYER).map(v => [v, []])),
    playing: PLAYER.YOU,
    playingTurn: [PLAYER.YOU, PLAYER.AI],
    isSkipable: false
  }
}

const debugInitialState = () => {
  return {
    ...initialState(),
    clear: {
      [PLAYER.YOU]: range(0, TABLE_SIZE * FLIP_MATCHING_COUNT),
      [PLAYER.AI]: []
    }
  }
}

const ACTION = {
  clickFlip: 'CLICK_FLIP',
  flip: 'FLIP',
  unflip: 'UNFLIP',
  reset: 'RESET',
  skip: 'SKIP',
  changePlayer: 'CHANGE_PLAYER'
}

const mutation = (state, action, payload) => {
  switch (action) {
    case ACTION.unflip:
      return { ...state, fliped: [] }
    case ACTION.flip:
      const { index } = payload
      const { fliped, table, clear, playing } = state
      if (fliped.includes(index)) {
        return state
      }
      const newFliped = [...fliped, index]
      const isSkipable =
        fliped.length >= 1 &&
        fliped.length <= FLIP_MATCHING_COUNT - 2 &&
        state.table[state.fliped[0]] !== state.table[index]
      const isClear =
        fliped.length === FLIP_MATCHING_COUNT - 1 &&
        fliped.map(i => table[i]).every(v => v === table[index])
      if (isClear) {
        return {
          ...state,
          fliped: [],
          clear: {
            ...clear,
            [playing]: [...clear[playing], ...newFliped]
          },
          isSkipable
        }
      } else {
        return {
          ...state,
          fliped: newFliped,
          isSkipable
        }
      }
    case ACTION.changePlayer:
      return { ...state, playing: payload.player }
    case ACTION.reset:
      return initialState()
    default:
      return state
  }
}

const playerCycleMapping = {
  [PLAYER.YOU]: youCycle,
  [PLAYER.AI]: aiCycle
}

function* gameCycle() {
  while (true) {
    while (true) {
      const { playingTurn } = yield effect.get()
      for (const playing of playingTurn) {
        // プレイヤーの変更
        yield effect.put(ACTION.changePlayer, { player: playing })
        // プレイヤーがめくる
        yield* playerCycleMapping[playing]()
        // めくられたのを裏っ返す
        yield* unflipCycle()
      }
      const { clear } = yield effect.get()
      if (isComplete(clear)) break
    }
    // リセットされるまで待つ
    yield effect.take(ACTION.reset)
  }
}

function* continueTurnCycle() {
  const state = yield effect.get()
  const canFlip = state.fliped.length < FLIP_MATCHING_COUNT
  return canFlip && !isComplete(state.clear)
}

function* youCycle() {
  while (yield* continueTurnCycle()) {
    const payload = yield effect.take(ACTION.clickFlip)
    yield effect.put(ACTION.flip, payload)
  }
}

function* aiCycle() {
  while (yield* continueTurnCycle()) {
    yield effect.call(delay, 1000)
    const state = yield effect.get()
    const candidate = range(0, TABLE_SIZE * FLIP_MATCHING_COUNT).filter(
      i =>
        !state.fliped.includes(i) &&
        !Object.values(state.clear)
          .flat()
          .includes(i)
    )
    yield effect.put(ACTION.flip, {
      index: candidate[Math.floor(Math.random() * candidate.length)]
    })
  }
}

function* unflipCycle() {
  yield effect.call(delay, 1000)
  yield effect.put(ACTION.unflip)
}

const { emit, use, run } = app(
  document.querySelector('#app'),
  initialState(),
  mutation,
  render
)

use(logger())
use(recycler(gameCycle))

run()
