import {
  app,
  html,
  logger,
  recycler,
  classNames as cn,
  delay,
  effect,
  unreachable,
  zip
} from './lib.js'
import {
  ACTION,
  PLAYER,
  STATUS,
  FLIP_OPTION,
  TABLE_SIZE_OPTION,
  START_PLAYER_OPTION,
  PLAYER_TEXT,
  CARD_SUIT
} from './constant.js'

const cardSuitPath = suit => `./assets/suit_${suit}.svg`

const renderCard = (number, suit, index, isFlip, isClear) => {
  const isFront = isFlip || isClear
  return html`
    <div class="card__container">
      <div
        class="${cn([
          'card',
          { front: isFront },
          { back: !isFront },
          { clear: isClear },
          suit
        ])}"
        onclick="${() => emit(ACTION.clickFlip, { index })}"
      >
        <div class="card__img front">
          <div class="card__number">${number}</div>
          <img class="card__suit" src="${cardSuitPath(suit)}" />
        </div>
        <div class="card__img back"></div>
      </div>
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

const renderSelect = (option, handleSelect, className) => html`
  <div class="${cn(['select', className])}">
    ${option.map(
      item =>
        html`
          <button
            class="${cn(['select__item', 'button', { active: item.selected }])}"
            onclick="${() => handleSelect(item.value)}"
          >
            ${item.label}
          </button>
        `
    )}
  </div>
`

const selected = value => item => ({
  ...item,
  selected: item.value === value
})

const renderStartModal = config =>
  renderModal(
    '神経衰弱',
    html`
      <div class="modal__container">
        <button
          class="${cn(['button', 'modal__button-start'])}"
          onclick="${() => emit(ACTION.start)}"
        >
          スタート
        </button>
        <div class="modal__select-wrap">
          <div class="modal__select-title">どっちから？</div>
          ${renderSelect(
            START_PLAYER_OPTION.map(selected(config.playingTurn[0])),
            v => emit(ACTION.configPlayingTurn, { value: v }),
            'select__table-size'
          )}
        </div>
        <div class="modal__select-wrap">
          <div class="modal__select-title">揃える枚数</div>
          ${renderSelect(
            FLIP_OPTION.map(selected(config.flipMatchingCount)),
            v => emit(ACTION.configFlip, { value: v }),
            'select__flip-matching-count'
          )}
        </div>
        <div class="modal__select-wrap">
          <div class="modal__select-title">カードの種類</div>
          ${renderSelect(
            TABLE_SIZE_OPTION.map(selected(config.tableSize)),
            v => emit(ACTION.configTableSize, { value: v }),
            'select__table-size'
          )}
        </div>
      </div>
    `
  )

const clearText = playersSortedByCount => {
  if (
    playersSortedByCount.every(v => v.count === playersSortedByCount[0].count)
  ) {
    return 'ひきわけ!'
  } else {
    return `${PLAYER_TEXT[playersSortedByCount[0].player]}の勝ち!`
  }
}

const renderClearModal = clear => {
  const players = Object.keys(clear)
  const playersSortedByCount = players
    .map(p => ({ count: clear[p].length, player: p }))
    .sort((a, b) => b.count - a.count)
  return renderModal(
    clearText(playersSortedByCount),
    html`
      <div>
        <div class="result">
          ${playersSortedByCount.map(
            v => html`
              <div class="result__item">
                <div class="result__player">${PLAYER_TEXT[v.player]}</div>
                <div class="result__count">${v.count}マイ</div>
              </div>
            `
          )}
        </div>
        <button
          class="${cn(['button', 'modal__button-reset'])}"
          onclick="${() => emit(ACTION.reset)}"
        >
          最初から
        </button>
      </div>
    `
  )
}

const renderStatusModal = (status, config, clear) => {
  switch (status) {
    case STATUS.START:
      return renderStartModal(config)
    case STATUS.COMPLETE:
      return renderClearModal(clear)
    default:
      return ''
  }
}

const objValue = obj => Object.values(obj).flat()

const render = ({
  clear,
  fliped,
  table,
  suit,
  isSkipable,
  status,
  config,
  playing
}) => {
  const isFlip = i => fliped.includes(i)
  const isClear = i => objValue(clear).includes(i)
  const modal = renderStatusModal(status, config, clear)
  const headerText =
    fliped.length === config.flipMatchingCount
      ? 'カードをタップして裏に戻す'
      : playing === PLAYER.YOU
      ? `あなたの番です! あと${config.flipMatchingCount - fliped.length}マイ`
      : playing === PLAYER.AI
      ? 'AIがプレイ中...'
      : unreachable(playing)
  return html`
    <main class="root" ontouchstart="">
      ${modal}
      <div class="root__game">
        <div class="root__header">
          <div class="root__header-text">${headerText}</div>
        </div>
        <div class="root__table">
          ${table.map((v, i) =>
            renderCard(v, suit[v], i, isFlip(i), isClear(i))
          )}
        </div>
        <button
          class="${cn([
            'root__skip-button',
            'button',
            { active: isSkipable && playing == PLAYER.YOU }
          ])}"
          onclick=${() => emit(ACTION.skip, {})}
        >
          スキップ
        </button>
      </div>
    </main>
  `
}

const range = (offset, size) =>
  new Array(size).fill(0).map((_, i) => offset + i)

const initialState = () => {
  const initialConfig = {
    tableSize: 6,
    flipMatchingCount: 2,
    playingTurn: [PLAYER.YOU, PLAYER.AI]
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
  const randomSuit = range(0, config.tableSize).map(_ =>
    sample(Object.values(CARD_SUIT))
  )
  // suit = { [key: number]: CARD_SUIT }
  const suit = Object.fromEntries(zip(singleTable, randomSuit))
  return {
    table,
    suit,
    fliped: [],
    clear: {
      [PLAYER.YOU]: [],
      [PLAYER.AI]: []
    },
    playing: PLAYER.YOU,
    status: STATUS.START,
    isSkipable: false
  }
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
    case ACTION.configFlip: {
      const newConfig = { ...state.config, flipMatchingCount: payload.value }
      return {
        config: newConfig,
        ...initialGameState(newConfig)
      }
    }
    case ACTION.configTableSize: {
      const newConfig = { ...state.config, tableSize: payload.value }
      return {
        config: newConfig,
        ...initialGameState(newConfig)
      }
    }
    case ACTION.configPlayingTurn: {
      const startPlayer = payload.value
      const playingTurn = [
        startPlayer,
        ...Object.values(PLAYER).filter(v => v !== startPlayer)
      ]
      const newConfig = { ...state.config, playingTurn }
      return {
        config: newConfig,
        ...initialGameState(newConfig)
      }
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
      const { config } = yield effect.get()
      for (const playing of config.playingTurn) {
        // プレイヤーの変更
        yield effect.put(ACTION.changePlayer, { player: playing })
        // プレイヤーがめくる
        const isSkip = yield* playerCycleMapping[playing]()
        // ぜんぶめくられてたらおわり
        if (yield* isCompleteCycle()) break
        // めくられたのを裏っ返す
        yield* unflipCycle(isSkip)
      }
      if (yield* isCompleteCycle()) break
    }
    // リセットされるまで待つ
    yield effect.take(ACTION.reset)
  }
}

function* isCompleteCycle() {
  const { status } = yield effect.get()
  return status === STATUS.COMPLETE
}

function* continueTurnCycle() {
  const state = yield effect.get()
  const canFlip = state.fliped.length < state.config.flipMatchingCount
  return canFlip && !(yield* isCompleteCycle())
}

function* youCycle() {
  while (yield* continueTurnCycle()) {
    // カードをタップするかリセットを押されるまで待つ
    const { flip, skip } = yield effect.race({
      flip: effect.take(ACTION.clickFlip),
      skip: effect.take(ACTION.skip)
    })
    if (flip) {
      yield effect.put(ACTION.flip, flip)
    } else if (skip) {
      return true
    } else {
      unreachable()
    }
  }
  return false
}

const sample = array => array[Math.floor(Math.random() * array.length)]

function* aiCycle() {
  while (yield* continueTurnCycle()) {
    yield effect.call(delay, 1000)
    const { fliped, clear, config } = yield effect.get()
    const { tableSize, flipMatchingCount } = config
    const candidate = range(0, tableSize * flipMatchingCount).filter(
      i => !fliped.includes(i) && !objValue(clear).includes(i)
    )
    yield effect.put(ACTION.flip, {
      index: sample(candidate)
    })
  }
}

function* unflipCycle(noWait) {
  if (!noWait) {
    yield effect.race({
      click: effect.take(ACTION.clickFlip),
      timeout: effect.call(delay, 5000)
    })
  }
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
