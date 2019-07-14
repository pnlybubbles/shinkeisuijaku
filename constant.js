export const BACK_CARD_PATH = './images/card_back.png'

export const PLAYER = {
  YOU: 'YOU',
  AI: 'AI'
}

export const FLIP_OPTION = [
  { label: '2マイ', value: 2 },
  { label: '3マイ', value: 3 }
]
export const TABLE_SIZE_OPTION = [
  { label: '6シュ', value: 2 },
  { label: '8シュ', value: 8 },
  { label: '10シュ', value: 10 }
]
export const START_PLAYER_OPTION = [
  { label: '先行', value: PLAYER.YOU },
  { label: '後攻', value: PLAYER.AI }
]

export const STATUS = {
  START: 'START',
  PLAYING: 'PLAYING',
  COMPLETE: 'COMPLETE'
}

export const ACTION = {
  clickFlip: 'CLICK_FLIP',
  flip: 'FLIP',
  unflip: 'UNFLIP',
  reset: 'RESET',
  start: 'START',
  skip: 'SKIP',
  changePlayer: 'CHANGE_PLAYER',
  configFlip: 'CONFIG_FLIP',
  configTableSize: 'CONFIG_TABLE_SIZE',
  configPlayingTurn: 'CONFIG_PLAYING_TURN'
}