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

const renderModal = (label, children) => html`
  <div class="modal">
    <div class="modal__window">
      <div class="modal__label">${label}</div>
      ${children}
    </div>
  </div>
`

const renderModalButton = (label, className, onClick) => html`
  <button
    class="${classNames(['modal__button', className])}"
    onclick="${onClick}"
  >
    ${label}
  </button>
`

const renderStartModal = config =>
  renderModal(
    'Start',
    html`
      <div class="modal__container">
        <div class="modal__button-wrap vertical">
          ${[
            renderModalButton(
              '2 Flip',
              {
                'modal__button-flip': true,
                active: config.flipMatchingCount === 2
              },
              () => emit(ACTION.configFlip, { count: 2 })
            ),
            renderModalButton(
              '3 Flip',
              {
                'modal__button-flip': true,
                active: config.flipMatchingCount === 3
              },
              () => emit(ACTION.configFlip, { count: 3 })
            )
          ]}
        </div>
        <div class="modal__button-wrap vertical">
          ${renderModalButton('Go!', 'modal__button-start', () =>
            emit(ACTION.start)
          )}
        </div>
      </div>
    `
  )

const renderClearModal = () =>
  renderModal(
    'Clear!',
    html`
      <div>
        ${renderModalButton('Reset', 'modal__button-reset', () =>
          emit(ACTION.reset)
        )}
      </div>
    `
  )

const renderStatusModal = (status, config) => {
  switch (status) {
    case STATUS.START:
      return renderStartModal(config)
    case STATUS.COMPLETE:
      return renderClearModal()
    default:
      return ''
  }
}

const objValue = obj => Object.values(obj).flat()

const render = ({ clear, fliped, table, isSkipable, status, config }) => {
  const isFlip = i => fliped.includes(i)
  const isClear = i => objValue(clear).includes(i)
  const modal = renderStatusModal(status, config)
  return html`
    <main class="root">
      ${modal}
      <div class="${classNames(['root__game', { blur: modal !== '' }])}">
        <div class="root__table">
          ${table.map((v, i) => renderCard(v, i, isFlip(i), isClear(i)))}
        </div>
        <button
          class="${classNames(['root__skip-button', { active: isSkipable }])}"
          onclick=${() => emit(ACTION.skip)}
        >
          Skip
        </button>
      </div>
    </main>
  `
}

const PLAYER = {
  YOU: 'YOU',
  AI: 'AI'
}

const STATUS = {
  START: 'START',
  PLAYING: 'PLAYING',
  COMPLETE: 'COMPLETE'
}

const range = (offset, size) =>
  new Array(size).fill(0).map((_, i) => offset + i)

const initialState = () => {
  const initialConfig = {
    tableSize: 6,
    flipMatchingCount: 2
  }
  return {
    config: initialConfig,
    ...initialGameState(initialConfig)
  }
}

const initialGameState = config => {
  const singleTable = range(1, config.tableSize)
  const table = new Array(config.flipMatchingCount)
    .fill(singleTable)
    .flat()
    .sort(() => Math.random() - 0.5)
  return {
    table,
    fliped: [],
    clear: {
      [PLAYER.YOU]: [],
      [PLAYER.AI]: []
    },
    playing: PLAYER.YOU,
    playingTurn: [PLAYER.YOU, PLAYER.AI],
    status: STATUS.START,
    isSkipable: false
  }
}

const ACTION = {
  clickFlip: 'CLICK_FLIP',
  flip: 'FLIP',
  unflip: 'UNFLIP',
  reset: 'RESET',
  start: 'START',
  skip: 'SKIP',
  changePlayer: 'CHANGE_PLAYER',
  configFlip: 'CONFIG_FLIP'
}

const isComplete = (clear, table) =>
  Object.values(clear).flat().length === table.length

const mutation = (state, action, payload) => {
  switch (action) {
    case ACTION.unflip:
      return { ...state, fliped: [] }
    case ACTION.flip:
      const { index } = payload
      const { fliped, table, clear, playing, config } = state
      if (fliped.includes(index)) {
        return state
      }
      const newFliped = [...fliped, index]
      const isSkipable =
        fliped.length >= 1 &&
        fliped.length <= config.flipMatchingCount - 2 &&
        state.table[state.fliped[0]] !== state.table[index]
      const isClear =
        fliped.length === config.flipMatchingCount - 1 &&
        fliped.map(i => table[i]).every(v => v === table[index])
      if (isClear) {
        const newClear = {
          ...clear,
          [playing]: [...clear[playing], ...newFliped]
        }
        return {
          ...state,
          fliped: [],
          clear: newClear,
          status: isComplete(newClear, table)
            ? STATUS.COMPLETE
            : STATUS.PLAYING,
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
    case ACTION.configFlip:
      const newConfig = { ...state.config, flipMatchingCount: payload.count }
      return {
        config: newConfig,
        ...initialGameState(newConfig)
      }
    case ACTION.start:
      return { ...state, status: STATUS.PLAYING }
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
    yield effect.take(ACTION.start)
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
      const { status } = yield effect.get()
      if (status === STATUS.COMPLETE) break
    }
    // リセットされるまで待つ
    yield effect.take(ACTION.reset)
  }
}

function* continueTurnCycle() {
  const state = yield effect.get()
  const canFlip = state.fliped.length < state.config.flipMatchingCount
  return canFlip && state.status !== STATUS.COMPLETE
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
    const { fliped, clear, config } = yield effect.get()
    const { tableSize, flipMatchingCount } = config
    const candidate = range(0, tableSize * flipMatchingCount).filter(
      i => !fliped.includes(i) && !objValue(clear).includes(i)
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
