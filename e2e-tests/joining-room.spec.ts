import { expect, test } from '@playwright/test'

test('Two users joining the same room', async ({ browser }) => {
	// can't use nanoid here :(
	const location = `http://localhost:8787/${crypto.randomUUID()}`

	const context = await browser.newContext()
	const page = await context.newPage()
	await page.goto(location)
	await page.getByLabel('Enter your display name').fill('kevin')
	await page.getByLabel('Enter your display name').press('Enter')
	await expect(page.getByRole('button', { name: 'Join' })).toBeVisible()
	await page.getByRole('button', { name: 'Join' }).click()
	await expect(page.getByRole('button', { name: 'Leave' })).toBeVisible()

	const pageTwo = await context.newPage()
	await pageTwo.goto(location)
	await pageTwo.getByRole('button', { name: 'Join' }).click()
	await expect(pageTwo.getByRole('button', { name: 'Leave' })).toBeVisible()

	await expect
		.poll(async () => page.locator('video').count(), { timeout: 10_000 })
		.toBe(2)

	await expect
		.poll(async () => pageTwo.locator('video').count(), { timeout: 10_000 })
		.toBe(2)
})
