import {select, take} from 'typed-redux-saga'
import {call, put, fork} from 'redux-saga/effects'
import {SagaIterator} from 'redux-saga'
import {LocalGameState} from 'common/types/game-state'
import {runPickProcessSaga} from './pick-process-saga'
import {CardT} from 'common/types/game-state'
import CARDS, {SINGLE_USE_CARDS} from 'common/cards'
import {getPlayerId} from 'logic/session/session-selectors'
import {
	setOpenedModal,
	followUp,
	applyEffect,
	removeEffect,
} from 'logic/game/game-actions'
import HermitCard from 'common/cards/card-plugins/hermits/_hermit-card'
import EffectCard from 'common/cards/card-plugins/effects/_effect-card'
import SingleUseCard from 'common/cards/card-plugins/single-use/_single-use-card'
import ItemCard from 'common/cards/card-plugins/items/_item-card'

function* borrowSaga(): SagaIterator {
	yield put(setOpenedModal('borrow'))
	const result = yield* take(['BORROW_ATTACH', 'BORROW_DISCARD'])
	if (result.type === 'BORROW_DISCARD') {
		yield put(followUp({modalResult: {attach: false}}))
		return
	}

	yield put(followUp({modalResult: {attach: true}}))
}

function* singleUseSaga(card: CardT): SagaIterator {
	const cardInfo = SINGLE_USE_CARDS[card.cardId]
	if (!cardInfo) return

	if (cardInfo.canApply() && cardInfo.pickOn !== 'apply') {
		yield put(setOpenedModal('confirm'))
	} else if (card.cardId === 'chest') {
		yield put(setOpenedModal('chest'))
	} else if (cardInfo.pickOn === 'apply') {
		const result = yield call(
			runPickProcessSaga,
			cardInfo.name,
			cardInfo.pickReqs
		)
		if (result && result.length && result[0].pickedSlots?.length) {
			yield put(applyEffect({pickResults: {[card.cardId]: result}}))
		} else {
			yield put(removeEffect())
		}
	}
}

const getFollowUpName = (
	cardInfo: HermitCard | EffectCard | SingleUseCard | ItemCard
) => {
	if (
		cardInfo instanceof EffectCard ||
		cardInfo instanceof SingleUseCard ||
		cardInfo instanceof ItemCard
	)
		return cardInfo.name
	if (cardInfo.primary.power) cardInfo.primary.name
	if (cardInfo.secondary.power) cardInfo.secondary.name
	return cardInfo.name
}

function* actionLogicSaga(gameState: LocalGameState): SagaIterator {
	const playerId = yield* select(getPlayerId)
	const pState = gameState.players[playerId]
	const lastTurnAction =
		gameState.pastTurnActions[gameState.pastTurnActions.length - 1]

	if (pState.followUp) {
		const cardInfo = CARDS[pState.followUp] as
			| HermitCard
			| EffectCard
			| SingleUseCard
			| ItemCard
			| null
		if (cardInfo?.pickOn === 'followup') {
			let pickResults = null
			const name = getFollowUpName(cardInfo)
			while (!pickResults)
				pickResults = yield call(runPickProcessSaga, name, cardInfo.pickReqs)
			yield put(followUp({pickResults: {[pState.followUp]: pickResults}}))
		} else if (pState.followUp === 'grian_rare') {
			yield fork(borrowSaga)
		} else if (pState.followUp === 'spyglass') {
			yield put(setOpenedModal('spyglass'))
		} else if (pState.followUp === 'looting') {
			yield put(setOpenedModal('looting'))
		} else {
			// The server can set the next follow up
			yield put(followUp({}))
		}
	} else if (
		lastTurnAction === 'PLAY_SINGLE_USE_CARD' &&
		!pState.board.singleUseCardUsed &&
		pState.board.singleUseCard
	) {
		yield call(singleUseSaga, pState.board.singleUseCard)
	} else if (lastTurnAction === 'PLAYED_INVALID_CARD') {
		yield put(setOpenedModal('unmet-condition'))
	}
}

export default actionLogicSaga
