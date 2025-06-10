// large-acres-backend/src/index.ts

export interface Env {
	DB: D1Database;
}

// Odds for each of the 5 horses. Sum should ideally be > 1 to represent bookmaker's cut.
// These are just example odds.
const HORSE_ODDS = [
	{ id: 1, name: "Lightning Bolt", odds: 2.5 }, // Lower number means higher chance of winning, higher payout
	{ id: 2, name: "Steady Steed", odds: 3.0 },
	{ id: 3, name: "Gallop Gus", odds: 4.5 },
	{ id: 4, name: "Dark Horse", odds: 6.0 },
	{ id: 5, name: "Lucky Charm", odds: 10.0 },
];

// Helper to simulate race based on odds
function simulateRace(horses: typeof HORSE_ODDS): { id: number; name: string; odds: number } {
	// This is a simplified weighted random selection.
	// A lower 'odds' value means it's more likely to win.
	// We convert odds to weights: higher weight for lower odds.
	const weights = horses.map(h => 1 / h.odds);
	const totalWeight = weights.reduce((sum, w) => sum + w, 0);
	let random = Math.random() * totalWeight;

	for (let i = 0; i < horses.length; i++) {
		random -= weights[i];
		if (random < 0) {
			return horses[i];
		}
	}
	return horses[horses.length - 1]; // Fallback, should ideally not be reached if logic is correct
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


export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		const path = url.pathname;
		// let response: any = null; // This line might not be needed if each path returns directly

		// Basic router
		if (request.method === "POST" && path === "/api/freeBet") {
			try {
				const { userId, horseId, betAmount } = await request.json() as { userId: string, horseId: number, betAmount: number };

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

				const winner = simulateRace(HORSE_ODDS);
				let winnings = 0;
				let fragmentAwarded = false;
				let newNftFragmentCount = 0;
                let awardedNftId = null; // Store the actual awarded NFT ID

				if (winner.id === horseId) {
					// Winner! Payout is betAmount * odds.
					// The odds here are the actual payout multiplier.
					const selectedHorse = HORSE_ODDS.find(h => h.id === horseId);
					winnings = Math.floor(betAmount * (selectedHorse?.odds || 1)); // Fallback to 1x if horse not found (should not happen)

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
				const { userId } = await request.json() as { userId: string };

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

				return new Response(JSON.stringify({
					success: true,
					userId: user.id,
					horseshoes: user.horseshoes,
					lastDailyBonus: user.last_daily_bonus,
					fragments: userFragments, // Array of {nft_id, count}
					totalNftFragments: totalNftFragments // Sum of all fragment counts
				}), { headers: { 'Content-Type': 'application/json' } });

			} catch (e: any) {
				console.error("Error in /api/getUserData:", e.message, e.stack);
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
