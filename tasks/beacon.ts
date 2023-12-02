import EventSource from 'eventsource'
import fetch from 'node-fetch'


export interface Withdrawal {
	index: number;
	validator_index: number;
	address: string;
	amount: number;
}
  
export interface PayloadAttributes {
	timestamp: number;
	prev_randao: string;
	suggested_fee_recipient: string;
	withdrawals: Withdrawal[];
}
  
export interface BeaconEventData {
	proposer_index: number;
	proposal_slot: number;
	parent_block_number: number;
	parent_block_root: string;
	parent_block_hash: string;
	payload_attributes: PayloadAttributes;
}
  
export interface BeaconEvent {
	version: string;
	data: BeaconEventData;
}

export class BeaconPAListener {
	lastBeaconMsg: BeaconEvent | null = null
	client: EventSource | null = null
	lastSlot: number = 0
	endpoint: string

	constructor(endpoint: string = 'http://localhost:3500') {
		this.endpoint = endpoint
		this.startListening()
	}

	async waitForNextSlot(pollIntervalMs: number = 100): Promise<BeaconEvent> {
		const lastKnownSlot = this.lastSlot
		return new Promise((resolve) => {
			const interval = setInterval(() => {
				if (this.lastSlot > lastKnownSlot) {
					clearInterval(interval)
					resolve(this.lastBeaconMsg)
				}
			}, pollIntervalMs)
		})
	} 

	private startListening(): void {
		const url = this.endpoint + '/eth/v1/events?topics=payload_attributes'
		this.client = new EventSource(url)

		this.client.addEventListener('payload_attributes', (event: MessageEvent) => {
			this.lastBeaconMsg = this.parseBeaconEvent(event.data)
			this.lastSlot = this.lastBeaconMsg.data.proposal_slot
			console.log('📡 New slot:', this.lastSlot)
		})

		this.client.addEventListener('open', () => {
			console.log('📡 Listening to beacon node')
		})

		this.client.addEventListener('error', (event: Event) => {
			console.log('📡 Error while listening to beacon node:', event)
			this.client.close()
			throw new Error('Beacon node connection error')
		})

	}

	private parseBeaconEvent(jsonStr: string): BeaconEvent {
		const parsed = JSON.parse(jsonStr)

		const converted: BeaconEvent = {
			version: parsed.version,
			data: {
				proposer_index: Number(parsed.data.proposer_index),
				proposal_slot: Number(parsed.data.proposal_slot),
				parent_block_number: Number(parsed.data.parent_block_number),
				parent_block_root: parsed.data.parent_block_root,
				parent_block_hash: parsed.data.parent_block_hash,
				payload_attributes: {
					timestamp: Number(parsed.data.payload_attributes.timestamp),
					prev_randao: parsed.data.payload_attributes.prev_randao,
					suggested_fee_recipient: parsed.data.payload_attributes.suggested_fee_recipient,
					withdrawals: parsed.data.payload_attributes.withdrawals.map((w: any) => ({
						index: Number(w.index),
						validator_index: Number(w.validator_index),
						address: w.address,
						amount: Number(w.amount)
					}))
				}
			}
		}

		return converted
	}

}

export interface ValidatorMsg {
	pubkey: string;
	feeRecipient: string;
	gasLimit: number;
	timestamp: number;
}

export async function getValidatorForSlot(relayUrl: string, slot: number): Promise<ValidatorMsg | null> {
	const url = relayUrl + '/relay/v1/builder/validators'
	const validators = await fetch(url).then(r => r.json()) // todo:handle err
	const validator = validators.find(v => parseInt(v.slot) == slot)
	if (!validator)
		return null
	const vmsg = validator.entry.message

	return {
		pubkey: vmsg.pubkey,
		feeRecipient: vmsg.fee_recipient,
		gasLimit: parseInt(vmsg.gas_limit),
		timestamp: parseInt(vmsg.timestamp),
	}
}


