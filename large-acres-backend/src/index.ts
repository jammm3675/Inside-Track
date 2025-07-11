// large-acres-backend/src/index.ts

export interface Env {
	DB: D1Database;
	BOT_TOKEN?: string; // Added for initData validation
}

// START ADDITION: Telegram initData validation function
async function isValidTelegramInitData(initDataString: string, botToken: string | undefined): Promise<boolean> {
    if (!initDataString) {
        console.warn("isValidTelegramInitData: initDataString is missing.");
        return false;
    }

    const params = new URLSearchParams(initDataString);
    const hash = params.get('hash');

    if (!hash) {
        console.warn("isValidTelegramInitData: hash is missing from initDataString.");
        return false;
    }

    params.delete('hash'); // Remove hash before sorting and creating data-check-string

    // Keys must be sorted alphabetically
    const dataCheckArr: string[] = [];
    const sortedKeys = Array.from(params.keys()).sort();
    for (const key of sortedKeys) {
        dataCheckArr.push(`${key}=${params.get(key)}`);
    }
    const dataCheckString = dataCheckArr.join('\n');

    if (!botToken) {
        console.warn("isValidTelegramInitData: BOT_TOKEN is not available. Skipping actual cryptographic validation. Returning true for development purposes as hash exists.");
        return true; // Permissive mode for development when BOT_TOKEN is not set
    }

    try {
        // Actual crypto validation using Web Crypto API
        const encoder = new TextEncoder();
        // 1. Create the secret_key: HMAC-SHA256 hash of "WebAppData" using bot_token as the key.
        const secretKeyMaterial = await crypto.subtle.importKey(
            'raw', encoder.encode(botToken),
            { name: 'HMAC', hash: 'SHA-256' },
            false, ['sign']
        );
        const secretKey = await crypto.subtle.sign('HMAC', secretKeyMaterial, encoder.encode('WebAppData'));

        // 2. Create the validation_key: HMAC-SHA256 hash of data_check_string using the secret_key.
        const validationKeyMaterial = await crypto.subtle.importKey(
            'raw', secretKey,
            { name: 'HMAC', hash: 'SHA-256' },
            false, ['sign']
        );
        const calculatedHashBytes = await crypto.subtle.sign('HMAC', validationKeyMaterial, encoder.encode(dataCheckString));

        const calculatedHashHex = Array.from(new Uint8Array(calculatedHashBytes))
            .map(b => b.toString(16).padStart(2, '0')).join('');

        console.log("Calculated Hash:", calculatedHashHex, "Received Hash:", hash);
        return calculatedHashHex === hash;
    } catch (error) {
        console.error("Error during Telegram initData cryptographic validation:", error);
        return false; // Fail validation on crypto error
    }
}
// END ADDITION

// Renamed and updated for 4 turtles
const TURTLE_ODDS = [
    { id: 1, name: "Red Turtle", odds: 3.0 },    // Example odds
    { id: 2, name: "Blue Turtle", odds: 3.5 },
    { id: 3, name: "Green Turtle", odds: 4.0 },
    { id: 4, name: "Yellow Turtle", odds: 2.5 }  // Example: Yellow Turtle is a slight favorite
];

// Helper to simulate race based on odds
// The function parameter type should also be updated if we want strict typing,
// but it will work with TURTLE_ODDS due to structural similarity.
// For clarity, changing `typeof HORSE_ODDS` to `typeof TURTLE_ODDS`.
function simulateRace(racers: typeof TURTLE_ODDS): { id: number; name: string; odds: number } {
	// This is a simplified weighted random selection.
	// A lower 'odds' value means it's more likely to win.
	// We convert odds to weights: higher weight for lower odds.
	const weights = racers.map(h => 1 / h.odds);
	const totalWeight = weights.reduce((sum, w) => sum + w, 0);
	let random = Math.random() * totalWeight;

	for (let i = 0; i < racers.length; i++) {
		random -= weights[i];
		if (random < 0) {
			return racers[i];
		}
	}
	return racers[racers.length - 1]; // Fallback, should ideally not be reached if logic is correct
}

// START ADDITION: New function for daily bonus amount
function getDailyBonusAmount(): number {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
  // Bonuses: Mon (20) Tue (30) Wed (40) Thu (50) Fri (60) Sat (80) Sun (100)
  // Original requirement: [100, 20, 30, 40, 50, 60, 80] for Пн-Вс.
  // JS getDay(): Sun=0, Mon=1, ..., Sat=6. Aligning array to JS getDay():
  const bonuses = [
      100, // Sunday (index 0)
      20,  // Monday (index 1)
      30,  // Tuesday (index 2)
      40,  // Wednesday (index 3)
      50,  // Thursday (index 4)
      60,  // Friday (index 5)
      80   // Saturday (index 6)
  ];
  return bonuses[dayOfWeek];
}
// END ADDITION

async function getOrCreateUser(db: D1Database, userId: string) {
	let userResult = await db.prepare("SELECT * FROM users WHERE id = ?").bind(userId).first();
	if (!userResult) {
		await db.prepare("INSERT INTO users (id, horseshoes, last_daily_bonus) VALUES (?, ?, ?)")
			.bind(userId, 100, new Date(0).toISOString().split('T')[0]) // Start with 100 horseshoes, epoch for last bonus
			.run();
		userResult = { id: userId, horseshoes: 100, last_daily_bonus: new Date(0).toISOString().split('T')[0] };
	}
	return userResult as { id: string; horseshoes: number; last_daily_bonus: string };
}

const NFT_CRAFTING_REQUIREMENT = 15; // 15 fragments needed to craft an NFT
const HORSESHOES_PER_AD_REWARD = 15;

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		const path = url.pathname;
		// let response: any = null; // This line might not be needed if each path returns directly

		// Basic router
		if (request.method === "POST" && path === "/api/freeBet") {
			try {
				// MODIFIED: Add initData to body and validate
				const body = await request.json() as { userId: string, horseId: number, betAmount: number, initData?: string };
				if (!body.initData || !(await isValidTelegramInitData(body.initData, env.BOT_TOKEN))) {
					console.error("Failed Telegram initData validation for /api/freeBet");
					return new Response(JSON.stringify({ error: "Unauthorized: Invalid initData" }), {
						status: 401, headers: { 'Content-Type': 'application/json' }
					});
				}
				const { userId, horseId, betAmount } = body;
				// END MODIFICATION

				if (!userId || !horseId || betAmount == null || betAmount <= 0) {
					return new Response(JSON.stringify({ error: "Missing userId, horseId, or invalid betAmount" }), { status: 400, headers: { 'Content-Type': 'application/json' } });
				}

                const user = await getOrCreateUser(env.DB, userId);

				if (user.horseshoes < betAmount) {
					return new Response(JSON.stringify({ error: "Insufficient horseshoes" }), { status: 400, headers: { 'Content-Type': 'application/json' } });
				}

				// Deduct bet amount
				const newHorseshoeBalance = user.horseshoes - betAmount;
				await env.DB.prepare("UPDATE users SET horseshoes = ? WHERE id = ?")
					.bind(newHorseshoeBalance, userId)
					.run();

                await env.DB.prepare("INSERT INTO transactions (transaction_id, user_id, type, amount, date) VALUES (?, ?, ?, ?, ?)")
                    .bind(crypto.randomUUID(), userId, 'free_bet_placed', -betAmount, new Date().toISOString())
                    .run();

				const winner = simulateRace(TURTLE_ODDS); // UPDATED to use TURTLE_ODDS
				let winnings = 0;
				let fragmentAwarded = false;
				let newNftFragmentCount = 0;
                let awardedNftId = null; // Store the actual awarded NFT ID

				if (winner.id === horseId) { // horseId from payload is the selected turtleId
					// Winner! Payout is betAmount * odds.
					// The odds here are the actual payout multiplier.
					const selectedRacer = TURTLE_ODDS.find(h => h.id === horseId); // Use TURTLE_ODDS here
					winnings = Math.floor(betAmount * (selectedRacer?.odds || 1)); // Fallback to 1x if racer not found

					const finalBalance = newHorseshoeBalance + winnings;
					await env.DB.prepare("UPDATE users SET horseshoes = ? WHERE id = ?")
						.bind(finalBalance, userId)
						.run();

                    await env.DB.prepare("INSERT INTO transactions (transaction_id, user_id, type, amount, date) VALUES (?, ?, ?, ?, ?)")
                        .bind(crypto.randomUUID(), userId, 'free_bet_win', winnings, new Date().toISOString())
                        .run();

					// 20% chance of winning 1 NFT fragment
					if (Math.random() < 0.20) {
						fragmentAwarded = true;
						awardedNftId = `nft_type_${Math.ceil(Math.random() * 10)}`; // 10 types of NFTs

						// Check if user already has this fragment type
						let fragmentRow = await env.DB.prepare("SELECT fragments FROM nft_fragments WHERE user_id = ? AND nft_id = ?")
							.bind(userId, awardedNftId)
							.first<{ fragments: number }>();

						if (fragmentRow) {
							newNftFragmentCount = fragmentRow.fragments + 1;
							await env.DB.prepare("UPDATE nft_fragments SET fragments = ? WHERE user_id = ? AND nft_id = ?")
								.bind(newNftFragmentCount, userId, awardedNftId)
								.run();
						} else {
							newNftFragmentCount = 1;
							await env.DB.prepare("INSERT INTO nft_fragments (user_id, nft_id, fragments) VALUES (?, ?, ?)")
								.bind(userId, awardedNftId, newNftFragmentCount)
								.run();
						}
					}
				}

				response = {
					winner: winner,
					won: winner.id === horseId,
					winnings: winnings,
					newHorseshoeBalance: newHorseshoeBalance + winnings, // This is the balance *after* potential win
					fragmentAwarded: fragmentAwarded,
					awardedNftFragmentId: fragmentAwarded ? awardedNftId : null,
                    updatedHorseshoeBalance: newHorseshoeBalance + winnings,
                    nftFragmentUpdate: fragmentAwarded ? { nftId: awardedNftId, count: newNftFragmentCount } : null
				};
                return new Response(JSON.stringify(response), { headers: { 'Content-Type': 'application/json' } });

			} catch (e: any) {
				console.error("Error in /api/freeBet:", e.message, e.stack);
				return new Response(JSON.stringify({ error: "Server error", details: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
			}
		}
		// START ADDITION: New endpoint for daily bonus
		else if (request.method === "POST" && path === "/api/claimDailyBonus") {
			try {
				// MODIFIED: Add initData to body and validate
				const body = await request.json() as { userId: string, initData?: string };
				if (!body.initData || !(await isValidTelegramInitData(body.initData, env.BOT_TOKEN))) {
					console.error("Failed Telegram initData validation for /api/claimDailyBonus");
					return new Response(JSON.stringify({ error: "Unauthorized: Invalid initData" }), {
						status: 401, headers: { 'Content-Type': 'application/json' }
					});
				}
				const { userId } = body;
				// END MODIFICATION

				if (!userId) {
					return new Response(JSON.stringify({ error: "Missing userId" }), {
						status: 400, headers: { 'Content-Type': 'application/json' }
					});
				}

				const user = await getOrCreateUser(env.DB, userId);
				const todayStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

				if (user.last_daily_bonus === todayStr) {
					return new Response(JSON.stringify({
						success: false,
						message: "Daily bonus already claimed today.",
						horseshoes: user.horseshoes
					}), { status: 200, headers: { 'Content-Type': 'application/json' } });
				}

				const bonusAmount = getDailyBonusAmount();
				const newHorseshoeBalance = user.horseshoes + bonusAmount;

				const stmt = env.DB.prepare(
					"UPDATE users SET horseshoes = ?, last_daily_bonus = ? WHERE id = ?"
				);
				await stmt.bind(newHorseshoeBalance, todayStr, userId).run();

				await env.DB.prepare(
					"INSERT INTO transactions (transaction_id, user_id, type, amount, date) VALUES (?, ?, ?, ?, ?)"
				).bind(crypto.randomUUID(), userId, 'daily_bonus', bonusAmount, new Date().toISOString()).run();

				return new Response(JSON.stringify({
					success: true,
					message: `You claimed ${bonusAmount} horseshoes!`,
					bonusAmount: bonusAmount,
					newHorseshoeBalance: newHorseshoeBalance
				}), { headers: { 'Content-Type': 'application/json' } });

			} catch (e: any) {
				console.error("Error in /api/claimDailyBonus:", e.message, e.stack);
				return new Response(JSON.stringify({ error: "Server error", details: e.message }), {
					status: 500, headers: { 'Content-Type': 'application/json' }
				});
			}
		}
		// START ADDITION: New GET endpoint for user data
		else if (request.method === "GET" && path === "/api/getUserData") {
			try {
				const userId = url.searchParams.get("userId");

				if (!userId) {
					return new Response(JSON.stringify({ error: "Missing userId query parameter" }), {
						status: 400, headers: { 'Content-Type': 'application/json' }
					});
				}

				const user = await getOrCreateUser(env.DB, userId); // Gets horseshoes and ensures user exists

				// Fetch all NFT fragments for the user
				const fragmentsStmt = env.DB.prepare("SELECT nft_id, fragments FROM nft_fragments WHERE user_id = ?");
				const fragmentResults = await fragmentsStmt.bind(userId).all<{nft_id: string, fragments: number}>();

				let totalNftFragments = 0;
				const userFragments = fragmentResults.results ? fragmentResults.results.map(f => {
					totalNftFragments += f.fragments;
					return { nft_id: f.nft_id, count: f.fragments };
				}) : [];

				// START ADDITION: Fetch crafted NFTs for the user
				const craftedNftStmt = env.DB.prepare("SELECT nft_id, crafted_at FROM user_crafted_nfts WHERE user_id = ? ORDER BY crafted_at DESC");
				const craftedNftResults = await craftedNftStmt.bind(userId).all<{nft_id: string, crafted_at: string}>();
				const userCraftedNfts = craftedNftResults.results || [];
				// END ADDITION

				return new Response(JSON.stringify({
					success: true,
					userId: user.id,
					horseshoes: user.horseshoes,
					lastDailyBonus: user.last_daily_bonus,
					fragments: userFragments,
					totalNftFragments: totalNftFragments,
					craftedNfts: userCraftedNfts // Add craftedNfts to the response
				}), { headers: { 'Content-Type': 'application/json' } });

			} catch (e: any) {
				console.error("Error in /api/getUserData:", e.message, e.stack);
				return new Response(JSON.stringify({ error: "Server error", details: e.message }), {
					status: 500, headers: { 'Content-Type': 'application/json' }
				});
			}
		}
		// START ADDITION: New POST endpoint for awarding fragments after star payment
		else if (request.method === "POST" && path === "/api/awardStarFragments") {
			try {
				// MODIFIED: Add initData to body and validate
				const body = await request.json() as { userId: string, paymentId?: string, starsAmount?: number, initData?: string };
				if (!body.initData || !(await isValidTelegramInitData(body.initData, env.BOT_TOKEN))) {
					console.error("Failed Telegram initData validation for /api/awardStarFragments");
					return new Response(JSON.stringify({ error: "Unauthorized: Invalid initData" }), {
						status: 401, headers: { 'Content-Type': 'application/json' }
					});
				}
				const { userId /*, paymentId, starsAmount */ } = body;
				// END MODIFICATION

				if (!userId) {
					return new Response(JSON.stringify({ error: "Missing userId" }), {
						status: 400, headers: { 'Content-Type': 'application/json' }
					});
				}

				// Ensure user exists (though they should if they made a payment)
				await getOrCreateUser(env.DB, userId);

				const numberOfFragmentsToAward = Math.floor(Math.random() * 6) + 5; // Randomly 5 to 10 fragments
				const awardedFragmentsDetails = [];

				for (let i = 0; i < numberOfFragmentsToAward; i++) {
					const randomNftId = `nft_type_${Math.ceil(Math.random() * 10)}`; // 10 types of NFTs

					// Check if user already has this fragment type
					let fragmentRow = await env.DB.prepare("SELECT fragments FROM nft_fragments WHERE user_id = ? AND nft_id = ?")
						.bind(userId, randomNftId)
						.first<{ fragments: number }>();

					let currentFragmentCount = 0;
					if (fragmentRow) {
						currentFragmentCount = fragmentRow.fragments;
					}

					const newNftFragmentCount = currentFragmentCount + 1;

					if (fragmentRow) {
						await env.DB.prepare("UPDATE nft_fragments SET fragments = ? WHERE user_id = ? AND nft_id = ?")
							.bind(newNftFragmentCount, userId, randomNftId)
							.run();
					} else {
						await env.DB.prepare("INSERT INTO nft_fragments (user_id, nft_id, fragments) VALUES (?, ?, ?)")
							.bind(userId, randomNftId, newNftFragmentCount) // new count is 1 if new
							.run();
					}
					awardedFragmentsDetails.push({ nftId: randomNftId, newCount: newNftFragmentCount });
				}

				// Record a single transaction for this bundle of fragments
				await env.DB.prepare(
					"INSERT INTO transactions (transaction_id, user_id, type, amount, date) VALUES (?, ?, ?, ?, ?)"
				).bind(
					crypto.randomUUID(),
					userId,
					'stars_payment_fragments',
					numberOfFragmentsToAward, // Store number of fragments awarded in 'amount'
					new Date().toISOString()
				).run();

				return new Response(JSON.stringify({
					success: true,
					message: `Successfully awarded ${numberOfFragmentsToAward} NFT fragments.`,
					awardedFragmentsCount: numberOfFragmentsToAward,
					fragmentsDetails: awardedFragmentsDetails // Could be useful for client
				}), { headers: { 'Content-Type': 'application/json' } });

			} catch (e: any) {
				console.error("Error in /api/awardStarFragments:", e.message, e.stack);
				return new Response(JSON.stringify({ error: "Server error", details: e.message }), {
					status: 500, headers: { 'Content-Type': 'application/json' }
				});
			}
		}
		// START ADDITION: New POST endpoint for crafting NFTs
		else if (request.method === "POST" && path === "/api/craftNft") {
			try {
				// MODIFIED: Add initData to body and validate
				const body = await request.json() as { userId: string, nftIdToCraft: string, initData?: string };
				if (!body.initData || !(await isValidTelegramInitData(body.initData, env.BOT_TOKEN))) {
					console.error("Failed Telegram initData validation for /api/craftNft");
					return new Response(JSON.stringify({ error: "Unauthorized: Invalid initData" }), {
						status: 401, headers: { 'Content-Type': 'application/json' }
					});
				}
				const { userId, nftIdToCraft } = body;
				// END MODIFICATION

				if (!userId || !nftIdToCraft) {
					return new Response(JSON.stringify({ error: "Missing userId or nftIdToCraft" }), {
						status: 400, headers: { 'Content-Type': 'application/json' }
					});
				}

				// 1. Check if user already crafted this NFT
				const existingCraftedNft = await env.DB.prepare(
					"SELECT nft_id FROM user_crafted_nfts WHERE user_id = ? AND nft_id = ?"
				).bind(userId, nftIdToCraft).first();

				if (existingCraftedNft) {
					return new Response(JSON.stringify({
						success: false,
						message: `NFT ${nftIdToCraft} already crafted.`
					}), { status: 400, headers: { 'Content-Type': 'application/json' } });
				}

				// 2. Check if user has enough fragments
				const fragmentRow = await env.DB.prepare(
					"SELECT fragments FROM nft_fragments WHERE user_id = ? AND nft_id = ?"
				).bind(userId, nftIdToCraft).first<{ fragments: number }>();

				if (!fragmentRow || fragmentRow.fragments < NFT_CRAFTING_REQUIREMENT) {
					return new Response(JSON.stringify({
						success: false,
						message: `Insufficient fragments for ${nftIdToCraft}. Need ${NFT_CRAFTING_REQUIREMENT}. You have ${fragmentRow?.fragments || 0}.`
					}), { status: 400, headers: { 'Content-Type': 'application/json' } });
				}

				// 3. Deduct fragments
				const newFragmentCount = fragmentRow.fragments - NFT_CRAFTING_REQUIREMENT;
				if (newFragmentCount > 0) {
					await env.DB.prepare(
						"UPDATE nft_fragments SET fragments = ? WHERE user_id = ? AND nft_id = ?"
					).bind(newFragmentCount, userId, nftIdToCraft).run();
				} else {
					// If count becomes 0, delete the fragment row for cleanliness
					await env.DB.prepare(
						"DELETE FROM nft_fragments WHERE user_id = ? AND nft_id = ?"
					).bind(userId, nftIdToCraft).run();
				}

				// 4. Record the crafted NFT
				await env.DB.prepare(
					"INSERT INTO user_crafted_nfts (user_id, nft_id, crafted_at) VALUES (?, ?, ?)"
				).bind(userId, nftIdToCraft, new Date().toISOString()).run();

				// 5. Log transaction (without description)
				await env.DB.prepare(
					"INSERT INTO transactions (transaction_id, user_id, type, amount, date) VALUES (?, ?, ?, ?, ?)"
				).bind(
					crypto.randomUUID(),
					userId,
					'nft_crafted',
					-NFT_CRAFTING_REQUIREMENT, // Representing cost in fragments
					new Date().toISOString()
				).run();

				return new Response(JSON.stringify({
					success: true,
					message: `Successfully crafted NFT: ${nftIdToCraft}!`,
					nftId: nftIdToCraft,
					newFragmentBalance: newFragmentCount
				}), { headers: { 'Content-Type': 'application/json' } });

			} catch (e: any) {
				console.error("Error in /api/craftNft:", e.message, e.stack);
				return new Response(JSON.stringify({ error: "Server error", details: e.message }), {
					status: 500, headers: { 'Content-Type': 'application/json' }
				});
			}
		}
		// START ADDITION: New POST endpoint for awarding ad rewards
		else if (request.method === "POST" && path === "/api/awardAdReward") {
			try {
				// MODIFIED: Add initData to body and validate
				const body = await request.json() as { userId: string, initData?: string };
				if (!body.initData || !(await isValidTelegramInitData(body.initData, env.BOT_TOKEN))) {
					console.error("Failed Telegram initData validation for /api/awardAdReward");
					return new Response(JSON.stringify({ error: "Unauthorized: Invalid initData" }), {
						status: 401, headers: { 'Content-Type': 'application/json' }
					});
				}
				const { userId } = body;
				// END MODIFICATION

				if (!userId) {
					return new Response(JSON.stringify({ error: "Missing userId" }), {
						status: 400, headers: { 'Content-Type': 'application/json' }
					});
				}

				const user = await getOrCreateUser(env.DB, userId);
				const newHorseshoeBalance = user.horseshoes + HORSESHOES_PER_AD_REWARD;

				await env.DB.prepare(
					"UPDATE users SET horseshoes = ? WHERE id = ?"
				).bind(newHorseshoeBalance, userId).run();

				await env.DB.prepare(
					"INSERT INTO transactions (transaction_id, user_id, type, amount, date) VALUES (?, ?, ?, ?, ?)"
				).bind(
					crypto.randomUUID(),
					userId,
					'ad_reward_horseshoes',
					HORSESHOES_PER_AD_REWARD,
					new Date().toISOString()
				).run();

				return new Response(JSON.stringify({
					success: true,
					message: `Successfully awarded ${HORSESHOES_PER_AD_REWARD} horseshoes for watching an ad!`,
					awardedAmount: HORSESHOES_PER_AD_REWARD,
					newHorseshoeBalance: newHorseshoeBalance
				}), { headers: { 'Content-Type': 'application/json' } });

			} catch (e: any) {
				console.error("Error in /api/awardAdReward:", e.message, e.stack);
				return new Response(JSON.stringify({ error: "Server error", details: e.message }), {
					status: 500, headers: { 'Content-Type': 'application/json' }
				});
			}
		}
		// END ADDITION
		else if (path === "/") {
			return new Response("Welcome to Large Acres API!");
		}

		// Fallback for routes not found or methods not allowed
		return new Response(JSON.stringify({ error: "Not Found or Method Not Allowed" }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		});
	},
};
