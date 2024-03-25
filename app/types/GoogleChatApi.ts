type Widget =
	| {
			textParagraph: {
				text: string
			}
	  }
	| {
			decoratedText?: {
				startIcon?: {
					knownIcon: string
				}
				text: string
			}
	  }
	| {
			buttonList: {
				buttons: {
					text: string
					onClick: {
						openLink: {
							url: string
						}
					}
				}[]
			}
	  }

interface Section {
	header: string
	collapsible?: boolean
	widgets: Widget[]
	uncollapsibleWidgetsCount?: number
}

interface Card {
	cardId: string
	card: {
		header?: {
			title: string
			subtitle?: string
			imageUrl?: string
			imageType?: string
			imageAltText?: string
		}
		sections: Section[]
	}
}

export interface ChatCard {
	cardsV2: Card[]
}
