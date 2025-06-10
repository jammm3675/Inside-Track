// large-acres-backend/src/index.ts

// Ensure Cloudflare Workers types are referenced for D1Database, ExecutionContext etc.
/// <reference types="@cloudflare/workers-types" />

export interface Env {
    DB: D1Database; // Should be recognized if @cloudflare/workers-types is installed and tsconfig is correct
    BOT_TOKEN?: string;
}

const HORSE_ODDS = [
    { id: 1, name: 'Lightning Bolt', odds: 2.5 },
    { id: 2, name: 'Steady Steed', odds: 3.0 },
    { id: 3, name: 'Gallop Gus', odds: 4.5 },
    { id: 4, name: 'Dark Horse', odds: 6.0 },
    { id: 5, name: 'Lucky Charm', odds: 10.0 },
];

const NFT_CRAFTING_REQUIREMENT = 15;
const HORSESHOES_PER_AD_REWARD = 15;

// In src/index.ts:
// Replace the ENTIRE isValidTelegramInitData function with this:
async function isValidTelegramInitData(initDataString: string, botToken: string | undefined): Promise<boolean> {
    if (!initDataString) {
        console.warn('isValidTelegramInitData: initDataString is missing.');
        return false;
    }

    const params = new URLSearchParams(initDataString);
    const hash = params.get('hash');

    if (!hash) {
        console.warn('isValidTelegramInitData: hash is missing from initDataString.');
        return false;
    }

    params.delete('hash'); // Remove hash before sorting and creating data-check-string
    
    const dataCheckArr: string[] = [];
    const tempArr: { key: string, value: string }[] = [];

    // Use forEach to iterate, which is well-typed
    params.forEach((value, key) => {
        tempArr.push({ key, value });
    });

    // Sort the array of key-value pairs by key
    tempArr.sort((a, b) => a.key.localeCompare(b.key));

    // Construct the data_check_string from the sorted array
    for (const item of tempArr) {
        dataCheckArr.push(`${item.key}=${item.value}`);
    }
    const dataCheckString = dataCheckArr.join('\n');

    if (!botToken) {
        console.warn('isValidTelegramInitData: BOT_TOKEN is not available. Skipping actual cryptographic validation. Returning true for development purposes as hash exists.');
        return true;
    }

    try {
        const encoder = new TextEncoder();
        // 1. Create the secret_key: HMAC-SHA256 hash of "WebAppData" using bot_token as the key.
        // Note: Telegram's documentation implies a two-step HMAC process.
        // secret_key = HMAC_SHA256(data=bot_token, key="WebAppData") is one interpretation for first step key.
        // More directly, it might be:
        // const secretKeyForSigningDataCheckString = await crypto.subtle.importKey('raw', encoder.encode(botToken), { name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
        // And then use this key to sign dataCheckString.
        // However, the common interpretation for initData is:
        // secret_key_material_for_hmac_sha256 = BOT_TOKEN
        // data_to_sign_for_final_hash = data_check_string
        // hash_algorithm = HMAC-SHA256 with secret_key_material_for_hmac_sha256

        // The Telegram documentation for Mini Apps states:
        // data-check-string is a string of all received parameters without the hash field sorted alphabetically in the format key=<value> separated by a newline character 

        // The hexadecimal representation of the HMAC-SHA-256 signature of the data-check-string with the secret key from the bot token is then compared with the hash.
        // The secret key is the token from BotFather.

        const key = await crypto.subtle.importKey(
            'raw',
            encoder.encode(botToken), // The bot token is the secret key
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        );
        
        const calculatedHashBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(dataCheckString));
        
        const calculatedHashHex = Array.from(new Uint8Array(calculatedHashBytes))
            .map(b => b.toString(16).padStart(2, '0')).join('');
        
        // console.log("Data Check String:", dataCheckString);
        // console.log("Calculated Hash:", calculatedHashHex, "Received Hash:", hash);
        return calculatedHashHex === hash;
    } catch (error) {
        console.error('Error during Telegram initData cryptographic validation:', error);
        return false;
    }
}
// Ensure the rest of your src/index.ts file (Env interface, other functions, export default) remains the same as my previous complete version.

async function getOrCreateUser(db: D1Database, userId: string): Promise<{ id: string; horseshoes: number; last_daily_bonus: string }> {
    let userResult = await db.prepare('SELECT id, horseshoes, last_daily_bonus FROM users WHERE id = ?').bind(userId).first<{ id: string; horseshoes: number; last_daily_bonus: string }>();
    if (!userResult) {
        const initialHorseshoes = 100;
        const epochBonusDate = new Date(0).toISOString().split('T')[0];
        await db.prepare('INSERT INTO users (id, horseshoes, last_daily_bonus) VALUES (?, ?, ?)')
            .bind(userId, initialHorseshoes, epochBonusDate)
            .run();
        userResult = { id: userId, horseshoes: initialHorseshoes, last_daily_bonus: epochBonusDate };
    }
    return userResult;
}

function simulateRace(horses: typeof HORSE_ODDS): { id: number; name: string; odds: number } {
    const weights = horses.map(h => 1 / h.odds);
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    let random = Math.random() * totalWeight;
    for (let i = 0; i < horses.length; i++) {
        random -= weights[i];
        if (random < 0) {
            return horses[i];
        }
    }
    return horses[horses.length - 1]; // Fallback
}

function getDailyBonusAmount(): number {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
    const bonuses = [100, 20, 30, 40, 50, 60, 80]; // Sun, Mon, Tue, Wed, Thu, Fri, Sat
    return bonuses[dayOfWeek];
}

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const url = new URL(request.url);
        const path = url.pathname;
        let responseData: any = null; // Renamed variable to avoid conflict with global Response type

        if (request.method === 'POST') {
            let originalBody: any;
            try {
                originalBody = await request.json();
            } catch (e) {
                return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
            }

            const { initData, ...actualPayload } = originalBody;

            if (!initData || !(await isValidTelegramInitData(initData as string, env.BOT_TOKEN))) {
                console.error('Failed Telegram initData validation for path:', path, 'InitData present:', !!initData);
                return new Response(JSON.stringify({ error: 'Unauthorized: Invalid initData' }), {
                    status: 401, headers: { 'Content-Type': 'application/json' }
                });
            }

            // All POST endpoints now use actualPayload
            if (path === '/api/freeBet') {
                const { userId, horseId, betAmount } = actualPayload as { userId: string; horseId: number; betAmount: number };
                if (!userId || !horseId || betAmount == null || betAmount <= 0) {
                    return new Response(JSON.stringify({ error: 'Missing userId, horseId, or invalid betAmount' }), { status: 400 });
                }
                const user = await getOrCreateUser(env.DB, userId);
                if (user.horseshoes < betAmount) {
                    return new Response(JSON.stringify({ error: 'Insufficient horseshoes' }), { status: 400 });
                }
                const newHorseshoeBalance = user.horseshoes - betAmount;
                await env.DB.prepare('UPDATE users SET horseshoes = ? WHERE id = ?').bind(newHorseshoeBalance, userId).run();
                await env.DB.prepare('INSERT INTO transactions (transaction_id, user_id, type, amount, date) VALUES (?, ?, ?, ?, ?)')
                    .bind(crypto.randomUUID(), userId, 'free_bet_placed', -betAmount, new Date().toISOString()).run();

                const winner = simulateRace(HORSE_ODDS);
                let winnings = 0;
                let fragmentAwarded = false;
                let awardedNftId: string | null = null;
                let newNftFragmentTotalCountForType = 0;

                if (winner.id === horseId) {
                    const selectedHorse = HORSE_ODDS.find(h => h.id === horseId);
                    winnings = Math.floor(betAmount * (selectedHorse?.odds || 1));
                    await env.DB.prepare('UPDATE users SET horseshoes = ? WHERE id = ?').bind(newHorseshoeBalance + winnings, userId).run();
                    await env.DB.prepare('INSERT INTO transactions (transaction_id, user_id, type, amount, date) VALUES (?, ?, ?, ?, ?)')
                        .bind(crypto.randomUUID(), userId, 'free_bet_win', winnings, new Date().toISOString()).run();

                    if (Math.random() < 0.20) {
                        fragmentAwarded = true;
                        awardedNftId = `nft_type_${Math.ceil(Math.random() * 10)}`;
                        const fragmentRow = await env.DB.prepare('SELECT fragments FROM nft_fragments WHERE user_id = ? AND nft_id = ?').bind(userId, awardedNftId).first<{ fragments: number }>();
                        newNftFragmentTotalCountForType = (fragmentRow?.fragments || 0) + 1;
                        if (fragmentRow) {
                            await env.DB.prepare('UPDATE nft_fragments SET fragments = ? WHERE user_id = ? AND nft_id = ?').bind(newNftFragmentTotalCountForType, userId, awardedNftId).run();
                        } else {
                            await env.DB.prepare('INSERT INTO nft_fragments (user_id, nft_id, fragments) VALUES (?, ?, ?)').bind(userId, awardedNftId, newNftFragmentTotalCountForType).run();
                        }
                    }
                }
                responseData = {
                    winner: winner,
                    won: winner.id === horseId,
                    winnings: winnings,
                    updatedHorseshoeBalance: newHorseshoeBalance + winnings,
                    fragmentAwarded: fragmentAwarded,
                    awardedNftFragmentId: awardedNftId,
                    nftFragmentUpdate: fragmentAwarded ? { nftId: awardedNftId, count: newNftFragmentTotalCountForType } : null
                };
                return new Response(JSON.stringify(responseData), { headers: { 'Content-Type': 'application/json' } });

            } else if (path === '/api/claimDailyBonus') {
                const { userId } = actualPayload as { userId: string };
                 if (!userId) return new Response(JSON.stringify({ error: "Missing userId" }), { status: 400 });

                const user = await getOrCreateUser(env.DB, userId);
                const todayStr = new Date().toISOString().split('T')[0];
                if (user.last_daily_bonus === todayStr) {
                    return new Response(JSON.stringify({ success: false, message: 'Daily bonus already claimed today.', horseshoes: user.horseshoes }), { status: 200 });
                }
                const bonusAmount = getDailyBonusAmount();
                const finalBalance = user.horseshoes + bonusAmount;
                await env.DB.prepare('UPDATE users SET horseshoes = ?, last_daily_bonus = ? WHERE id = ?').bind(finalBalance, todayStr, userId).run();
                await env.DB.prepare('INSERT INTO transactions (transaction_id, user_id, type, amount, date) VALUES (?, ?, ?, ?, ?)')
                    .bind(crypto.randomUUID(), userId, 'daily_bonus', bonusAmount, new Date().toISOString()).run();
                responseData = { success: true, message: `You claimed ${bonusAmount} horseshoes!`, bonusAmount: bonusAmount, newHorseshoeBalance: finalBalance };
                return new Response(JSON.stringify(responseData), { headers: { 'Content-Type': 'application/json' } });

            } else if (path === '/api/awardStarFragments') {
                const { userId /*, starsAmount */ } = actualPayload as { userId: string, starsAmount?: number };
                if (!userId) return new Response(JSON.stringify({ error: "Missing userId" }), { status: 400 });
                await getOrCreateUser(env.DB, userId); // Ensure user exists
                const numberOfFragmentsToAward = Math.floor(Math.random() * 6) + 5;
                const awardedFragmentsDetails = [];
                for (let i = 0; i < numberOfFragmentsToAward; i++) {
                    const randomNftId = `nft_type_${Math.ceil(Math.random() * 10)}`;
                    const fragmentRow = await env.DB.prepare('SELECT fragments FROM nft_fragments WHERE user_id = ? AND nft_id = ?').bind(userId, randomNftId).first<{ fragments: number }>();
                    const newCount = (fragmentRow?.fragments || 0) + 1;
                    if (fragmentRow) {
                        await env.DB.prepare('UPDATE nft_fragments SET fragments = ? WHERE user_id = ? AND nft_id = ?').bind(newCount, userId, randomNftId).run();
                    } else {
                        await env.DB.prepare('INSERT INTO nft_fragments (user_id, nft_id, fragments) VALUES (?, ?, ?)').bind(userId, randomNftId, newCount).run();
                    }
                    awardedFragmentsDetails.push({ nftId: randomNftId, newCount: newCount });
                }
                await env.DB.prepare('INSERT INTO transactions (transaction_id, user_id, type, amount, date) VALUES (?, ?, ?, ?, ?)')
                    .bind(crypto.randomUUID(), userId, 'stars_payment_fragments', numberOfFragmentsToAward, new Date().toISOString()).run();
                responseData = { success: true, message: `Successfully awarded ${numberOfFragmentsToAward} NFT fragments.`, awardedFragmentsCount: numberOfFragmentsToAward, fragmentsDetails: awardedFragmentsDetails };
                return new Response(JSON.stringify(responseData), { headers: { 'Content-Type': 'application/json' } });

            } else if (path === '/api/craftNft') {
                const { userId, nftIdToCraft } = actualPayload as { userId: string; nftIdToCraft: string };
                if (!userId || !nftIdToCraft) return new Response(JSON.stringify({ error: "Missing userId or nftIdToCraft" }), { status: 400 });

                const existingCraftedNft = await env.DB.prepare('SELECT nft_id FROM user_crafted_nfts WHERE user_id = ? AND nft_id = ?').bind(userId, nftIdToCraft).first();
                if (existingCraftedNft) {
                    return new Response(JSON.stringify({ success: false, message: `NFT ${nftIdToCraft} already crafted.` }), { status: 400 });
                }
                const fragmentRow = await env.DB.prepare('SELECT fragments FROM nft_fragments WHERE user_id = ? AND nft_id = ?').bind(userId, nftIdToCraft).first<{ fragments: number }>();
                if (!fragmentRow || fragmentRow.fragments < NFT_CRAFTING_REQUIREMENT) {
                    return new Response(JSON.stringify({ success: false, message: `Insufficient fragments for ${nftIdToCraft}. Need ${NFT_CRAFTING_REQUIREMENT}. You have ${fragmentRow?.fragments || 0}.` }), { status: 400 });
                }
                const newFragmentCount = fragmentRow.fragments - NFT_CRAFTING_REQUIREMENT;
                if (newFragmentCount > 0) {
                    await env.DB.prepare('UPDATE nft_fragments SET fragments = ? WHERE user_id = ? AND nft_id = ?').bind(newFragmentCount, userId, nftIdToCraft).run();
                } else {
                    await env.DB.prepare('DELETE FROM nft_fragments WHERE user_id = ? AND nft_id = ?').bind(userId, nftIdToCraft).run();
                }
                await env.DB.prepare('INSERT INTO user_crafted_nfts (user_id, nft_id, crafted_at) VALUES (?, ?, ?)').bind(userId, nftIdToCraft, new Date().toISOString()).run();
                await env.DB.prepare('INSERT INTO transactions (transaction_id, user_id, type, amount, date) VALUES (?, ?, ?, ?, ?)')
                    .bind(crypto.randomUUID(), userId, 'nft_crafted', -NFT_CRAFTING_REQUIREMENT, new Date().toISOString()).run();
                responseData = { success: true, message: `Successfully crafted NFT: ${nftIdToCraft}!`, nftId: nftIdToCraft, newFragmentBalance: newFragmentCount };
                return new Response(JSON.stringify(responseData), { headers: { 'Content-Type': 'application/json' } });

            } else if (path === '/api/awardAdReward') {
                const { userId } = actualPayload as { userId: string };
                if (!userId) return new Response(JSON.stringify({ error: "Missing userId" }), { status: 400 });

                const user = await getOrCreateUser(env.DB, userId);
                const finalBalance = user.horseshoes + HORSESHOES_PER_AD_REWARD;
                await env.DB.prepare('UPDATE users SET horseshoes = ? WHERE id = ?').bind(finalBalance, userId).run();
                await env.DB.prepare('INSERT INTO transactions (transaction_id, user_id, type, amount, date) VALUES (?, ?, ?, ?, ?)')
                    .bind(crypto.randomUUID(), userId, 'ad_reward_horseshoes', HORSESHOES_PER_AD_REWARD, new Date().toISOString()).run();
                responseData = { success: true, message: `Successfully awarded ${HORSESHOES_PER_AD_REWARD} horseshoes for watching an ad!`, awardedAmount: HORSESHOES_PER_AD_REWARD, newHorseshoeBalance: finalBalance };
                return new Response(JSON.stringify(responseData), { headers: { 'Content-Type': 'application/json' } });
            }
            // If no POST path matched after validation
            return new Response(JSON.stringify({ error: 'API Action Not Found for POST' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

        } else if (request.method === 'GET' && path === '/api/getUserData') {
            // ... (existing GET /api/getUserData logic, ensure it's complete from previous steps)
            // This endpoint does not typically need initData validation if it's for public/semi-public info
            const userId = url.searchParams.get("userId");
            if (!userId) return new Response(JSON.stringify({ error: "Missing userId query parameter" }), { status: 400 });

            const user = await getOrCreateUser(env.DB, userId);
            const fragmentsStmt = env.DB.prepare("SELECT nft_id, fragments FROM nft_fragments WHERE user_id = ?");
            const fragmentResults = await fragmentsStmt.bind(userId).all<{nft_id: string, fragments: number}>();
            let totalNftFragments = 0;
            const userFragments = fragmentResults.results ? fragmentResults.results.map(f => {
                totalNftFragments += f.fragments;
                return { nft_id: f.nft_id, count: f.fragments };
            }) : [];
            const craftedNftStmt = env.DB.prepare("SELECT nft_id, crafted_at FROM user_crafted_nfts WHERE user_id = ? ORDER BY crafted_at DESC");
            const craftedNftResults = await craftedNftStmt.bind(userId).all<{nft_id: string, crafted_at: string}>();
            const userCraftedNfts = craftedNftResults.results || [];

            responseData = {
                success: true, userId: user.id, horseshoes: user.horseshoes,
                lastDailyBonus: user.last_daily_bonus, fragments: userFragments,
                totalNftFragments: totalNftFragments, craftedNfts: userCraftedNfts
            };
            return new Response(JSON.stringify(responseData), { headers: { 'Content-Type': 'application/json' } });

        } else if (path === '/') {
            return new Response('Welcome to Large Acres API!');
        }

        return new Response(JSON.stringify({ error: 'Not Found or Method Not Allowed' }), {
            status: 404, headers: { 'Content-Type': 'application/json' }
        });
    },
};
