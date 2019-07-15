import {
  app,
  html,
  logger,
  recycler,
  classNames as cn,
  delay,
  effect,
  unreachable,
  zip,
  anim
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
          'button',
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

const renderModal = ({ label, class: className }, children) => html`
  <div class="${cn(['modal', className])}">
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

const renderStartModal = state =>
  startModalAnim.mount(
    state,
    renderModal(
      {
        label: '神経衰弱',
        class: cn(['start-modal', startModalAnim.class(state)])
      },
      html`
        <div class="start-modal__container">
          <button
            class="${cn(['button', 'start-modal__button-start'])}"
            onclick="${() => emit(ACTION.start)}"
          >
            スタート
          </button>
          <div class="start-modal__select-wrap">
            <div class="start-modal__select-title">どっちから？</div>
            ${renderSelect(
              START_PLAYER_OPTION.map(selected(state.config.playingTurn[0])),
              v => emit(ACTION.configPlayingTurn, { value: v }),
              'select__table-size'
            )}
          </div>
          <div class="start-modal__select-wrap">
            <div class="start-modal__select-title">揃える枚数</div>
            ${renderSelect(
              FLIP_OPTION.map(selected(state.config.flipMatchingCount)),
              v => emit(ACTION.configFlip, { value: v }),
              'select__flip-matching-count'
            )}
          </div>
          <div class="start-modal__select-wrap">
            <div class="start-modal__select-title">カードの種類</div>
            ${renderSelect(
              TABLE_SIZE_OPTION.map(selected(state.config.tableSize)),
              v => emit(ACTION.configTableSize, { value: v }),
              'select__table-size'
            )}
          </div>
        </div>
      `
    )
  )

const startModalAnim = anim.create(
  'reveal',
  ACTION.reset,
  ACTION.start,
  300,
  true
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

const renderClearModal = state => {
  const { clear } = state
  const players = Object.keys(clear)
  const playersSortedByCount = players
    .map(p => ({ count: clear[p].length, player: p }))
    .sort((a, b) => b.count - a.count)
  return clearModalAnim.mount(
    state,
    renderModal(
      {
        label: clearText(playersSortedByCount),
        class: cn(['clear-modal', clearModalAnim.class(state)])
      },
      html`
        <div class="clear-modal__container">
          <div class="clear-modal__display">
            ${playersSortedByCount.map(
              v => html`
                <div class="clear-modal__item">
                  <div class="clear-modal__player">
                    ${PLAYER_TEXT[v.player]}
                  </div>
                  <div class="clear-modal__count">${v.count}</div>
                  <div class="clear-modal__mai">マイ</div>
                </div>
              `
            )}
          </div>
          <button
            class="${cn(['button', 'clear-modal__button-reset'])}"
            onclick="${() => emit(ACTION.reset)}"
          >
            最初から
          </button>
        </div>
      `
    )
  )
}

const clearModalAnim = anim.create('reveal', ACTION.clear, ACTION.reset, 300)

const objValue = obj => Object.values(obj).flat()

const render = state => {
  const {
    clear,
    fliped,
    table,
    suit,
    isSkipable,
    config,
    playing,
    status
  } = state
  const isFlip = i => fliped.includes(i)
  const isClear = i => objValue(clear).includes(i)
  const headerText =
    fliped.length === config.flipMatchingCount
      ? 'タップしてうらに戻す'
      : playing === PLAYER.YOU
      ? `あなたの番です! あと${config.flipMatchingCount - fliped.length}マイ`
      : playing === PLAYER.AI
      ? 'AIがプレイ中...'
      : unreachable(playing)
  return html`
    <main class="root" ontouchstart="">
      ${renderStartModal(state)}${renderClearModal(state)}
      <div class="${cn(['root__game', { active: status !== STATUS.START }])}">
        <div class="root__header">
          <div
            class="root__header-text button"
            onclick="${() => emit(ACTION.next)}"
          >
            ${headerText}
          </div>
        </div>
        <div class="root__table">
          ${table.map((v, i) =>
            renderCard(v, suit[v], i, isFlip(i), isClear(i))
          )}
        </div>
        <div
          class="${cn([
            'root__footer',
            { active: isSkipable && playing == PLAYER.YOU }
          ])}"
        >
          <button
            class="root__skip-button button"
            onclick=${() => emit(ACTION.skip, {})}
          >
            スキップ
          </button>
        </div>
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
    status: STATUS.START,
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
      if (objValue(clear).includes(index)) {
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
        ...state,
        config: newConfig
      }
    }
    case ACTION.configTableSize: {
      const newConfig = { ...state.config, tableSize: payload.value }
      return {
        ...state,
        config: newConfig
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
        ...state,
        config: newConfig
      }
    }
    case ACTION.start:
      return {
        ...state,
        ...initialGameState(state.config),
        status: STATUS.PLAYING
      }
    case ACTION.reset:
      return {
        ...state,
        status: STATUS.START
      }
    default:
      return anim.mutation(state, action, payload)
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
    yield effect.call(delay, 500)
    yield effect.put(ACTION.clear)
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
      next: effect.take(ACTION.next),
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

use(logger(true))
use(recycler(gameCycle))
use(recycler(clearModalAnim.cycle))
use(recycler(startModalAnim.cycle))

run()
