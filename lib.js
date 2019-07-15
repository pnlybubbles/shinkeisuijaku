export const BUILTIN_ACTION = {
  init: '__INIT__'
}

/**
 * アプリのインスタンス化
 * @param {HTMLElement} $target マウント先
 * @param {State} initialState ステートの初期値
 * @param {(State, Action, Payload) => State} mutation ステートの更新
 * @param {(State) => Tree} render 描画関数
 */
export const app = ($target, initialState, mutation, render) => {
  let state = initialState
  const middlewares = []
  const patchQueue = []
  // requestAnimationFrameの戻り値
  let requestId = null

  const requestPatch = dom => {
    // 1フレーム内で複数回patchingするのは無駄なのでQueueに詰める
    // 最新しか使わないけど一応Queueに持っておく
    patchQueue.push(dom)
    // 次フレームをリクエスト
    if (requestId === null) {
      requestId = requestAnimationFrame(() => {
        requestId = null
        const latestDom = patchQueue[patchQueue.length - 1]
        // patch処理
        if (!($target.childNodes[0] instanceof Node)) {
          $target.appendChild(latestDom)
        } else {
          updateDiffDom($target.childNodes[0], latestDom)
        }
        // Queueの削除
        patchQueue.splice(0, patchQueue.length)
      })
    }
  }

  const emit = (action, payload) => {
    const newState = mutation(state, action, payload)
    // 構造データを取得
    const root = render(newState)
    // DOM構築(キャッシュ適用)
    const dom = compile(root)
    // 差分更新(patch処理)
    requestPatch(dom)
    state = newState
    // ミドルウェア
    for (const mw of middlewares) {
      mw(action, payload)
    }
  }

  const getState = () => state
  const run = () => emit(BUILTIN_ACTION.init)
  const use = mw => middlewares.push(mw(emit)(getState))

  return { emit, use, run }
}

const NODE_TYPE = {
  ELEMENT_NODE: 1,
  COMMENT_NODE: 8
}

const isElementNode = node => node.nodeType === NODE_TYPE.ELEMENT_NODE
const isCommentNode = node => node.nodeType === NODE_TYPE.COMMENT_NODE

const replaceNode = (targetNode, newNode) => {
  targetNode.parentNode.replaceChild(newNode, targetNode)
}

const isShallowEqualNode = (targetNode, newNode) =>
  targetNode.nodeType === newNode.nodeType &&
  targetNode.nodeName === newNode.nodeName &&
  targetNode.nodeValue === newNode.nodeValue &&
  targetNode.childNodes.length === newNode.childNodes.length

// (targetNode: Node, newNode: Node) => void
// targetNodeをnewNodeと違う部分だけ更新する
const updateDiffDom = (targetNode, newNode) => {
  if (!isShallowEqualNode(targetNode, newNode)) {
    // ノードが異なる場合は置換
    replaceNode(targetNode, newNode)
  } else {
    if (isElementNode(targetNode) && isElementNode(newNode)) {
      // イベントリスナの差分更新
      const targetEvent = Object.keys(targetNode.dataset).filter(
        v => v.slice(0, 2) === 'on'
      )
      const newEvent = Object.keys(newNode.dataset).filter(
        v => v.slice(0, 2) === 'on'
      )
      // カスタムデータに`on~~~`がセットされているものだけ比較
      const interestEvent = targetEvent
        .concat(newEvent)
        .filter((v, i, self) => self.indexOf(v) === i)
      for (const onevent of interestEvent) {
        const listener = targetNode[onevent]
        const newListener = newNode[onevent]
        if (listener !== newListener) {
          targetNode[onevent] = newListener
        }
      }
      // 属性の差分更新
      for (const targetAttribute of targetNode.attributes) {
        const name = targetAttribute.name
        const newValue = newNode.getAttribute(name)
        if (newValue === null) {
          // 無い属性を削除
          targetNode.removeAttribute(name)
        } else if (newValue !== targetAttribute.value) {
          // 値が異なる属性を更新
          targetNode.setAttribute(name, newValue)
        }
      }
      for (const newAttribute of newNode.attributes) {
        if (targetNode.getAttribute(newAttribute.name) !== null) continue
        // 新しい属性を追加
        targetNode.setAttribute(newAttribute.name, newAttribute.value)
      }
    }
    for (const [targetNode_, newNode_] of [
      ...zip(targetNode.childNodes, newNode.childNodes)
    ].reverse()) {
      // ノードの差分更新
      updateDiffDom(targetNode_, newNode_)
    }
  }
}

const $cache = []

const saveCache = (vnode, dom) => {
  $cache.push({
    vnode,
    dom
  })
}

// (template: string[]) => { vnode, dom }
// テンプレートの配列内の文字列がすべて完全一致した場合にキャッシュを呼び出す
const fetchCache = template => {
  for (const c of $cache) {
    if (c.vnode.template.every((v, i) => template[i] === v)) {
      return c
    }
  }
  return null
}

// (vnode, slots) => { dom, slots }
// vnodeのテンプレートとアンカーを組み合わせてDOMを構成する
// 可能な場合はキャッシュされたDOMが利用可能なようにslotsを更新する
const getDomByVnode = (vnode, slots) => {
  const { template, anchors } = vnode
  const cached = fetchCache(template)
  if (cached !== null) {
    // キャッシュがある場合はDOMを再利用
    // キャッシュのDOMに埋め込まれているアンカーIDに対応するようにスロットのIDを更新
    return {
      dom: cached.dom.cloneNode(true),
      slots: Object.fromEntries(
        cached.vnode.anchors.map((a, i) => [a, slots[anchors[i]]])
      )
    }
  } else {
    // キャッシュにない場合はHTMLをパース
    const text = [...eachAlternately(template, anchors)].join('')
    const dom = new DOMParser()
      .parseFromString(text, 'text/html')
      .querySelector('body').childNodes[0]
    traverseNode(dom, node => {
      if (node.nodeValue !== null) {
        const text = node.nodeValue.trim()
        if (text.length > ANCHOR_LENGTH) {
          // テキストノード内でアンカー文字列が結合している場合
          // 正規表現で`!%........%`の抽出を行う
          // テキストノードに分割
          const anchors = matchAnchor(text)
          if (anchors !== null) {
            let lastIndex = 0
            for (const anchor of anchors) {
              // !%...%アンカーに挟まれたテキスト!%...%
              //       ↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑
              //       この部分を取ってくる
              const index = text.indexOf(anchor)
              const data = text.slice(lastIndex, index)
              if (data.length > 0) {
                // アンカーに挟まれたテキスト部分だけをテキストノード化
                node.parentNode.insertBefore(
                  document.createTextNode(data),
                  node
                )
              }
              // アンカーを単体でテキストノード化
              node.parentNode.insertBefore(
                document.createTextNode(anchor),
                node
              )
              lastIndex = index + ANCHOR_LENGTH
            }
            // 最後のアンカーの尻から最後までの文字列をテキストノード化
            const data = text.slice(lastIndex)
            if (data.length > 0) {
              node.parentNode.insertBefore(document.createTextNode(data), node)
            }
            // 基準にしてた初期のノードを削除
            node.remove()
          }
        }
      }
    })
    // キャッシュにDOMを対応するアンカーIDを保存
    saveCache(vnode, dom)
    return {
      dom: dom.cloneNode(true),
      slots
    }
  }
}

// template: 変数部で区切られた文字列の配列
// anchors: 変数部を識別するIDの配列
// slots: アンカーIDに対応する値を紐付けるハッシュテーブル
// Tree: { vnode, slots }
// vnode: { anchors: ID[], template: string[] }
// slots: { [ID]: SlotValue }
// ({ vnode, slots }: Tree) => dom
// vnodeとslotsからDOMを構成する
// vnodeのテンプレートからアンカーが埋め込まれたDOMを生成、DOMを走査してスロットを展開する
const compile = ({ vnode: vnode_, slots: slots_ }) => {
  const { dom, slots } = getDomByVnode(vnode_, slots_)
  const removeNodeQueue = []

  traverseNode(dom, node => {
    if (node.nodeValue !== null) {
      // Textノードの場合
      const slot = slots[node.nodeValue.trim()]
      if (slot) {
        switch (slot.type) {
          case SLOT_TYPE.NODE:
            // 再帰的に小要素をスロット展開
            replaceNode(node, compile(slot.value))
            break
          case SLOT_TYPE.VALUE:
            // 文字列としてスロット展開
            node.nodeValue = slot.value
            break
        }
      }
    }
    if (isElementNode(node)) {
      // Elementノードの場合
      for (const attr of node.attributes) {
        // 属性名をスロット展開
        let attrName = attr.name
        const attrNameSlot = slots[attrName]
        if (attrNameSlot) {
          node.setAttribute(attrNameSlot.value, attr.value)
          node.removeAttribute(attrName)
          attrName = attrNameSlot.value
        }
        // 属性値をスロット展開
        const attrValueSlot = slots[attr.value]
        if (attrValueSlot) {
          if (attrValueSlot.type === SLOT_TYPE.FUNCTION) {
            // 関数の場合はイベントリスナとしてプロパティに代入
            // イベント名をカスタムデータとして登録
            node.removeAttribute(attrName)
            node[attrName] = attrValueSlot.value
            node.dataset[attrName] = ''
            if (DEBUG && !EVENT_NAMES.includes(attrName)) {
              console.error(`Unknown event name: "${attrName}"`)
            }
          } else {
            node.setAttribute(attrName, attrValueSlot.value)
          }
        }
      }
    }
    if (isCommentNode(node)) {
      // コメントノードは削除
      removeNodeQueue.push(node)
    }
  })
  // 不要なノードの削除
  for (const node of removeNodeQueue) {
    node.remove()
  }
  return dom
}

const traverseNode = (node, f) => {
  f(node)
  for (const childNodes of node.childNodes) {
    traverseNode(childNodes, f)
  }
}

const SLOT_TYPE = {
  NODE: 'NODE',
  VALUE: 'VALUE',
  FUNCTION: 'FUNCTION'
}

/**
 * 描画関数`render`の戻り値をつくる
 * @param {*} templateOrg
 * @param  {...any} args
 * @return {Tree}
 */
export const html = (templateOrg, ...args) => {
  const slots = {}
  const anchors = []
  const template = [...templateOrg]
  for (let i = args.length - 1; i >= 0; i--) {
    let arg = Array.isArray(args[i]) && args[i].length === 0 ? null : args[i]
    if (Array.isArray(arg)) {
      // 配列が1つのスロットに入っている場合は、配列をフラットに展開して複数のスロットにする
      const slotArr = arg.map(a => parseArg(a))
      const anchorArr = slotArr.map(() => getAnchor())
      Object.assign(slots, Object.fromEntries(zip(anchorArr, slotArr)))
      anchors.unshift(...anchorArr)
      const textNodeSeparator = new Array(arg.length - 1).fill('')
      template.splice(i + 1, 0, ...textNodeSeparator)
    } else {
      // アンカーIDを生成
      // アンカーIDに対応したスロットをハッシュテーブルに追加
      const anchor = getAnchor()
      Object.assign(slots, { [anchor]: parseArg(arg) })
      anchors.unshift(anchor)
    }
  }
  const vnode = {
    template,
    anchors
  }
  return {
    vnode,
    slots
  }
}

/**
 * 8文字のランダム文字列を生成
 */
const randomString = () =>
  Math.random()
    .toString(36)
    .slice(-8)

// () => ID: string
const getAnchor = () => `!%${randomString()}%`
const ANCHOR_LENGTH = getAnchor().length

const matchAnchor = text => text.match(/!%[^%\s]{8}%/g)

// (arg: any) => SlotValue
// SlotValue:
//   { type: VALUE, value: string } |
//   { type: NODE, value: TREE }
//   { type: FUNCTION, value: Function }
const parseArg = arg => {
  if (arg === null) {
    return { type: SLOT_TYPE.VALUE, value: '' }
  }
  switch (typeof arg) {
    case 'string':
    case 'number':
      return {
        type: SLOT_TYPE.VALUE,
        value: arg.toString()
      }
    case 'function':
      return {
        type: SLOT_TYPE.FUNCTION,
        value: arg
      }
    case 'object':
      if ((arg.vnode, arg.slots)) {
        return {
          type: SLOT_TYPE.NODE,
          value: arg
        }
      } else {
        // Go through default ↓
      }
    default:
      console.warn('Unknown type of arg: ', arg)
      return {
        type: SLOT_TYPE.VALUE,
        value: arg.toString()
      }
  }
}

const EFFECT = {
  TAKE: 'TAKE',
  RACE: 'RACE',
  CALL: 'CALL',
  PUT: 'PUT',
  GET: 'GET'
}

/**
 * アクションが呼ばれるまで待機する。ペイロードを返す。
 * @param {ACTION} action
 */
const take = action => {
  return {
    effect: EFFECT.TAKE,
    args: {
      action
    }
  }
}

/**
 * 非同期の関数を呼び出す。非同期関数の実行結果を返す。
 * @param {(...any) => Promise} asyncTask 非同期関数
 * @param  {...any} args 非同期関数にわたす引数
 */
const call = (asyncTask, ...args) => {
  return {
    effect: EFFECT.CALL,
    args: {
      asyncTask,
      args
    }
  }
}

/**
 * アクションを実行する。
 * @param {ACTION} action ディスパッチするアクション
 * @param {*} payload ディスパッチするペイロード
 */
const put = (action, payload) => {
  return {
    effect: EFFECT.PUT,
    args: {
      action,
      payload
    }
  }
}

/**
 * 現在のステートを取得する
 */
const get = () => {
  return {
    effect: EFFECT.GET,
    args: {}
  }
}

/**
 * 複数のエフェクトのうち最初に終わったものだけ返す
 * @param {{[key: string]: Effect}} effects 複数のエフェクト
 */
const race = effects => {
  return {
    effect: EFFECT.RACE,
    args: {
      effects
    }
  }
}

export const effect = {
  call,
  put,
  take,
  race,
  get
}

export const recycler = cycleGenerator => emit => getState => {
  const gen = cycleGenerator()
  const cycle = new Cycle(gen, emit, getState)
  cycle.run()
  return (action, payload) => {
    cycle.dispatch(action, payload)
  }
}

class Cycle {
  constructor(gen, emit, getState) {
    this.gen = gen
    this.emit = emit
    this.getState = getState
    this.waitingAction = null
    this.finished = () => {}
    this.isCancel = false
    this.cocycles = []
  }

  dispatch(action, payload) {
    if (action === this.waitingAction) {
      this.run(payload)
    }
    for (const cocycle of this.cocycles) {
      cocycle.dispatch(action, payload)
    }
  }

  cancel() {
    this.isCancel = true
  }

  finish(cb) {
    this.finished = cb
  }

  run(arg) {
    if (this.isCancel) return
    const { value, done } = this.gen.next(arg)
    if (!done) {
      const { effect, args } = value
      switch (effect) {
        case EFFECT.CALL: {
          args
            .asyncTask(args.args)
            .then(v => this.run(v))
            .catch(e => {
              throw e
            })
          break
        }
        case EFFECT.PUT: {
          const { action, payload } = args
          this.emit(action, payload)
          this.run()
          break
        }
        case EFFECT.TAKE: {
          const { action } = args
          this.waitingAction = action
          break
        }
        case EFFECT.RACE: {
          const { effects } = args
          const keys = Object.keys(effects)
          const cocycles = keys.map(
            k =>
              new Cycle(
                (function*() {
                  return yield effects[k]
                })(),
                this.emit,
                this.getState
              )
          )
          this.cocycles = [...this.cocycles, ...cocycles]
          cocycles.forEach((cocycle, i) => {
            cocycle.finish(value => {
              for (const cocycle of cocycles) {
                cocycle.cancel()
                const index = this.cocycles.findIndex(v => v === cocycle)
                this.cocycles.splice(index, 1)
              }
              this.run({
                [keys[i]]: value
              })
            })
          })
          for (const cocycle of cocycles) {
            cocycle.run()
          }
          break
        }
        case EFFECT.GET: {
          this.run(this.getState())
          break
        }
        default:
          unreachable(effect)
      }
    } else {
      this.finished(value)
    }
  }
}

export const delay = ms =>
  new Promise(resolve => {
    setTimeout(resolve, ms)
  })

const nextFrame = () =>
  new Promise(resolve => {
    requestAnimationFrame(resolve)
  })

const ANIM_ACTION = '__ANIM__'
const ANIM_STATE_PREFIX = '__anim__'
const ANIM_STATE = {
  START: 'start',
  ACTIVE: 'active',
  RESET_START: 'reset-start',
  RESET_ACTIVE: 'reset-active',
  RESET: 'reset'
}

const animCreate = (
  name,
  action,
  resetAction,
  duration,
  activeImmediate = false
) => {
  const id = `_${randomString()}`
  const animDescriptor = {
    id,
    name,
    action,
    resetAction,
    activeImmediate,
    duration
  }
  if (typeof duration !== 'number') {
    console.error(`Invalid duration: ${duration}`)
  }
  return {
    class: animClass(animDescriptor),
    mount: animMount(animDescriptor),
    cycle: animCycle(animDescriptor)
  }
}

const animClass = animDescriptor => state => {
  const { id, name } = animDescriptor
  if (state[ANIM_STATE_PREFIX]) {
    const animState = state[ANIM_STATE_PREFIX][id]
    switch (animState) {
      case ANIM_STATE.START:
        return `${name}-${ANIM_STATE.START}`
      case ANIM_STATE.ACTIVE:
        return `${name}-${ANIM_STATE.ACTIVE}`
      case ANIM_STATE.RESET_START:
        return `${name}-${ANIM_STATE.RESET_START}`
      case ANIM_STATE.RESET_ACTIVE:
        return `${name}-${ANIM_STATE.RESET_ACTIVE}`
      case ANIM_STATE.RESET:
        return `${name}-${ANIM_STATE.RESET_ACTIVE}`
      default:
        return ''
    }
  } else {
    return ''
  }
}

const animMount = animDescriptor => (state, children) => {
  const { id } = animDescriptor
  if (state[ANIM_STATE_PREFIX] === undefined) return null
  if (
    [
      ANIM_STATE.START,
      ANIM_STATE.ACTIVE,
      ANIM_STATE.RESET_START,
      ANIM_STATE.RESET_ACTIVE
    ].includes(state[ANIM_STATE_PREFIX][id])
  ) {
    return children
  } else {
    return null
  }
}

const animMutaiton = (state, action, payload) => {
  if (action === ANIM_ACTION) {
    const { id, state: animState } = payload
    return {
      ...state,
      [ANIM_STATE_PREFIX]: {
        ...state[ANIM_STATE_PREFIX],
        [id]: animState
      }
    }
  } else {
    return state
  }
}

const animCycle = animDescriptor =>
  function*() {
    const {
      id,
      action,
      resetAction,
      activeImmediate,
      duration
    } = animDescriptor
    yield effect.take(BUILTIN_ACTION.init)
    if (activeImmediate) {
      yield effect.put(ANIM_ACTION, {
        id,
        state: ANIM_STATE.ACTIVE
      })
      yield effect.take(resetAction)
      yield effect.put(ANIM_ACTION, {
        id,
        state: ANIM_STATE.RESET_START
      })
      yield effect.call(nextFrame)
      yield effect.put(ANIM_ACTION, {
        id,
        state: ANIM_STATE.RESET_ACTIVE
      })
      yield effect.call(delay, duration)
      yield effect.put(ANIM_ACTION, {
        id,
        state: ANIM_STATE.RESET
      })
    } else {
      yield effect.put(ANIM_ACTION, {
        id,
        state: ANIM_STATE.RESET
      })
    }
    while (true) {
      yield effect.take(action)
      yield effect.put(ANIM_ACTION, {
        id,
        state: ANIM_STATE.START
      })
      yield effect.call(nextFrame)
      yield effect.put(ANIM_ACTION, {
        id,
        state: ANIM_STATE.ACTIVE
      })
      yield effect.take(resetAction)
      yield effect.put(ANIM_ACTION, {
        id,
        state: ANIM_STATE.RESET_START
      })
      yield effect.call(nextFrame)
      yield effect.put(ANIM_ACTION, {
        id,
        state: ANIM_STATE.RESET_ACTIVE
      })
      yield effect.call(delay, duration)
      yield effect.put(ANIM_ACTION, {
        id,
        state: ANIM_STATE.RESET
      })
    }
  }

export const anim = {
  mutation: animMutaiton,
  create: animCreate
}

const isBuiltinAction = action => /^__.+__$/.test(action)

/**
 * ログを出力するミドルウェア
 */
export const logger = (varbose = false) => _emit => getState => (
  action,
  payload
) => {
  if (!varbose && isBuiltinAction(action)) {
    return
  }
  console.log(
    `%c${getTimeString()} %c${action}%c %o %o`,
    styleObjectToString({
      color: '#aaa'
    }),
    styleObjectToString({
      'font-weight': 'bold',
      color: '#7c7'
    }),
    styleObjectToString({}),
    payload,
    getState()
  )
}

const getTimeString = () => {
  const date = new Date()
  const hour = date
    .getHours()
    .toString()
    .padStart(2, '0')
  const minute = date
    .getMinutes()
    .toString()
    .padStart(2, '0')
  const second = date
    .getSeconds()
    .toString()
    .padStart(2, '0')
  const millisecond = date
    .getMilliseconds()
    .toString()
    .padStart(4, '0')
  return `${hour}:${minute}:${second}.${millisecond}`
}

export const styleObjectToString = style =>
  Object.keys(style)
    .map(key => `${key}: ${style[key]};`)
    .join('\n')

export const classNames = arrayClassNames =>
  arrayClassNames
    .filter(v => v)
    .flatMap(v => {
      if (typeof v === 'object' && !Array.isArray(v)) {
        return Object.keys(v).filter(k => v[k])
      } else if (typeof v === 'string') {
        return v.split(' ').map(v => v.trim())
      } else {
        if (DEBUG) console.warn(`Invalid class name: %o`, v)
        return v
      }
    })
    .join(' ')

const EVENT_NAMES = Object.getOwnPropertyNames(HTMLElement.prototype).filter(
  v => v.slice(0, 2) === 'on'
)

export function* zip(a, b) {
  const minLength = Math.max(a.length, b.length)
  for (let i = 0; i < minLength; i++) {
    yield [a[i], b[i]]
  }
}

function* eachAlternately(first, second) {
  let i = 0
  let j = 0
  while (true) {
    if (i < first.length) yield first[i]
    i += 1
    if (j < second.length) yield second[j]
    j += 1
    if (i >= first.length && j >= second.length) break
  }
}

export const isIOS = /iP(hone|(o|a)d)/.test(navigator.userAgent)
export const isSP = /(iP(hone|(o|a)d))|Android/.test(navigator.userAgent)

export const DEBUG = location.hostname === 'localhost'

export const unreachable = v => {
  throw new Error(`Unreachable! ${v}`)
}
