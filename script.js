// script.js
const API_BASE_URL = 'https://large-acres-backend.nikitacirskov0.workers.dev'; // YOUR LIVE BACKEND URL

let tgUser = null;
let tgUserId = null;
let userOwnedFragments = [];
let userCraftedNfts = [];

function updatePlayerInfoDisplay(userId, horseshoes, totalNftFragments) {
    const userIdElement = document.getElementById('user-id');
    const horseshoeBalanceElement = document.getElementById('horseshoes-balance');
    const nftFragmentsBalanceElement = document.getElementById('nft-fragments-balance');

    if (userIdElement) userIdElement.textContent = userId || 'N/A';
    if (horseshoeBalanceElement) horseshoeBalanceElement.textContent = horseshoes !== undefined ? horseshoes.toString() : 'N/A';
    if (nftFragmentsBalanceElement) nftFragmentsBalanceElement.textContent = totalNftFragments !== undefined ? totalNftFragments.toString() : 'N/A';
}

async function fetchGameData(currentUserId) {
    if (!currentUserId) {
        console.log("User ID not available, cannot fetch game data initially.");
        updatePlayerInfoDisplay(currentUserId, 0, 0);
        renderNftFragmentList();
        renderUserCraftedNfts();
        return;
    }

    updatePlayerInfoDisplay(currentUserId, 'Loading...', 'Loading...');
    const fragmentListDiv = document.getElementById('nft-fragment-list');
    if (fragmentListDiv) fragmentListDiv.innerHTML = '<p>Loading your fragments...</p>';
    const collectionListDiv = document.getElementById('user-nft-collection-list');
    if (collectionListDiv) collectionListDiv.innerHTML = '<p>Loading your collection...</p>';

    try {
        const response = await fetch(`${API_BASE_URL}/api/getUserData?userId=${currentUserId}`); // <-- CORRECTED

        if (!response.ok) {
            console.warn(`Failed to fetch initial user data: ${response.status}. Response: ${await response.text()}`);
            updatePlayerInfoDisplay(currentUserId, 0, 0);
            userOwnedFragments = [];
            userCraftedNfts = [];
            renderNftFragmentList();
            renderUserCraftedNfts();
            return;
        }

        const data = await response.json();
        if (data && data.success) {
            updatePlayerInfoDisplay(currentUserId, data.horseshoes, data.totalNftFragments);
            userOwnedFragments = data.fragments || [];
            userCraftedNfts = data.craftedNfts || [];
            renderNftFragmentList();
            renderUserCraftedNfts();
        } else {
            console.warn("Received non-successful response or malformed data from /api/getUserData", data);
            updatePlayerInfoDisplay(currentUserId, 0, 0);
            userOwnedFragments = [];
            userCraftedNfts = [];
            renderNftFragmentList();
            renderUserCraftedNfts();
        }
    } catch (error) {
        console.error("Error fetching initial game data from /api/getUserData:", error);
        updatePlayerInfoDisplay(currentUserId, 'Error', 'Error');
        userOwnedFragments = [];
        userCraftedNfts = [];
        renderNftFragmentList();
        renderUserCraftedNfts();
    }
}

async function handleClaimDailyBonus() {
    if (!tgUserId || !window.Telegram?.WebApp?.initData) {
        alert("User ID or Telegram initData not available. Cannot claim bonus.");
        return;
    }
    const dailyBonusMessageElement = document.getElementById('daily-bonus-message');
    dailyBonusMessageElement.textContent = 'Claiming...';
    try {
        const payload = { userId: tgUserId, initData: window.Telegram.WebApp.initData };
        const response = await fetch(`${API_BASE_URL}/api/claimDailyBonus`, { // <-- CORRECTED
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (response.ok) {
            dailyBonusMessageElement.textContent = data.message;
            if (data.success) {
                document.getElementById('horseshoes-balance').textContent = data.newHorseshoeBalance.toString();
                alert(`Bonus claimed! You got ${data.bonusAmount} horseshoes.`);
            } else {
                alert(data.message);
            }
        } else {
            dailyBonusMessageElement.textContent = `Error: ${data.error || 'Failed to claim bonus.'} (Status: ${response.status})`;
            alert(`Error claiming bonus: ${data.error || response.statusText}`);
        }
    } catch (error) {
        console.error('Error claiming daily bonus:', error);
        dailyBonusMessageElement.textContent = 'An error occurred. Please try again.';
        alert('An error occurred while claiming the bonus.');
    }
}

async function handleFreeBet() {
    if (!tgUserId || !window.Telegram?.WebApp?.initData) {
        alert("User ID or Telegram initData not available. Cannot place bet.");
        return;
    }
    const horseSelectElement = document.getElementById('horse-select');
    const betAmountElement = document.getElementById('bet-amount-horseshoes');
    const winnerInfoElement = document.getElementById('winner-info');
    const horseId = parseInt(horseSelectElement.value);
    const betAmount = parseInt(betAmountElement.value);

    if (isNaN(horseId) || horseId < 1 || horseId > 5) { alert("Please select a valid horse."); return; }
    if (isNaN(betAmount) || betAmount <= 0) { alert("Please enter a valid bet amount."); return; }
    winnerInfoElement.textContent = 'Racing...';
    try {
        const payload = { userId: tgUserId, horseId: horseId, betAmount: betAmount, initData: window.Telegram.WebApp.initData };
        const response = await fetch(`${API_BASE_URL}/api/freeBet`, { // <-- CORRECTED
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (response.ok) {
            let resultMessage = `Race finished! Winner: Horse ${data.winner.id} (${data.winner.name}). `;
            resultMessage += data.won ? `Congratulations! You won ${data.winnings} horseshoes.` : `Better luck next time!`;
            if (data.fragmentAwarded) resultMessage += ` You also received an NFT fragment for ${data.awardedNftFragmentId}!`;
            winnerInfoElement.textContent = resultMessage;
            alert(resultMessage);
            document.getElementById('horseshoes-balance').textContent = data.updatedHorseshoeBalance.toString();
            fetchGameData(tgUserId);
        } else {
            winnerInfoElement.textContent = `Error: ${data.error || 'Failed to place bet.'} (Status: ${response.status})`;
            alert(`Error placing bet: ${data.error || response.statusText}`);
            fetchGameData(tgUserId);
        }
    } catch (error) {
        console.error('Error placing free bet:', error);
        winnerInfoElement.textContent = 'An error occurred. Please try again.';
        alert('An error occurred while placing the bet.');
        fetchGameData(tgUserId);
    }
}

async function handleStarBet() {
    if (!tgUserId || !window.Telegram?.WebApp?.initData) {
        alert("User ID or Telegram initData not available. Cannot make a stars payment.");
        return;
    }
    const betAmountStarsElement = document.getElementById('bet-amount-stars');
    const starsToSpend = parseInt(betAmountStarsElement.value);
    if (isNaN(starsToSpend) || starsToSpend <= 0) { alert("Please enter a valid amount of stars to spend."); return; }

    const winnerInfoElement = document.getElementById('winner-info');
    winnerInfoElement.textContent = `Processing payment for ${starsToSpend} stars...`;
    alert(`Simulating Telegram Stars payment for ${starsToSpend} stars...`);
    try {
        const payload = { userId: tgUserId, starsAmount: starsToSpend, initData: window.Telegram.WebApp.initData };
        const response = await fetch(`${API_BASE_URL}/api/awardStarFragments`, { // <-- CORRECTED
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (response.ok && data.success) {
            const message = `Payment successful! You received ${data.awardedFragmentsCount} NFT fragments.`;
            winnerInfoElement.textContent = message;
            alert(message);
            fetchGameData(tgUserId);
        } else {
            const errorMessage = `Star payment process failed: ${data.error || 'Unknown error'} (Status: ${response.status})`;
            winnerInfoElement.textContent = errorMessage;
            alert(errorMessage);
        }
    } catch (error) {
        console.error('Error during star bet process:', error);
        winnerInfoElement.textContent = 'An error occurred during the star payment process.';
        alert(winnerInfoElement.textContent);
    }
}

function renderNftFragmentList() {
    const fragmentListDiv = document.getElementById('nft-fragment-list');
    if (!fragmentListDiv) return;
    if (userOwnedFragments === undefined) { fragmentListDiv.innerHTML = '<p>Loading your fragments...</p>'; return; }
    if (userOwnedFragments.length === 0) { fragmentListDiv.innerHTML = '<p>You have no NFT fragments yet.</p>'; return; }
    let html = '<ul>';
    userOwnedFragments.forEach(fragment => {
        const canCraft = fragment.count >= 15;
        const isCrafted = userCraftedNfts.some(craftedNft => craftedNft.nft_id === fragment.nft_id);
        html += `<li>${fragment.nft_id}: ${fragment.count}/15 ${isCrafted ? '<span style="color: green;">(Crafted)</span>' : canCraft ? `<button class="craft-button" data-nftid="${fragment.nft_id}">Craft</button>` : ''}</li>`;
    });
    html += '</ul>';
    fragmentListDiv.innerHTML = html;
    document.querySelectorAll('.craft-button').forEach(button => button.addEventListener('click', handleCraftNft));
}

function renderUserCraftedNfts() {
    const collectionListDiv = document.getElementById('user-nft-collection-list');
    if (!collectionListDiv) return;
    if (userCraftedNfts === undefined) { collectionListDiv.innerHTML = '<p>Loading your collection...</p>'; return; }
    if (userCraftedNfts.length === 0) { collectionListDiv.innerHTML = '<p>No NFTs crafted yet.</p>'; return; }
    let html = '<ul>';
    userCraftedNfts.forEach(nft => {
        html += `<li>${nft.nft_id} (Crafted: ${new Date(nft.crafted_at).toLocaleDateString()})</li>`;
    });
    html += '</ul>';
    collectionListDiv.innerHTML = html;
}

async function handleCraftNft(event) {
    if (!tgUserId || !window.Telegram?.WebApp?.initData) {
        alert("User ID or Telegram initData not available. Cannot craft NFT.");
        return;
    }
    const nftIdToCraft = event.target.dataset.nftid;
    if (!nftIdToCraft) { alert("No NFT ID specified."); return; }
    const craftingStatusMessageElement = document.getElementById('crafting-status-message');
    craftingStatusMessageElement.textContent = `Crafting ${nftIdToCraft}...`;
    event.target.disabled = true;
    try {
        const payload = { userId: tgUserId, nftIdToCraft: nftIdToCraft, initData: window.Telegram.WebApp.initData };
        const response = await fetch(`${API_BASE_URL}/api/craftNft`, { // <-- CORRECTED
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (response.ok && data.success) {
            craftingStatusMessageElement.textContent = data.message;
            alert(data.message);
            fetchGameData(tgUserId);
        } else {
            craftingStatusMessageElement.textContent = `Crafting failed: ${data.message || 'Error'} (Status: ${response.status})`;
            alert(craftingStatusMessageElement.textContent);
            event.target.disabled = false;
        }
    } catch (error) {
        console.error('Error crafting NFT:', error);
        craftingStatusMessageElement.textContent = 'Crafting error. Try again.';
        alert(craftingStatusMessageElement.textContent);
        event.target.disabled = false;
    }
}

async function awardAdRewardApiCall() { // Combined handleWatchAd and awardAdRewardApiCall for simplicity
    if (!tgUserId || !window.Telegram?.WebApp?.initData) {
        alert("User ID or Telegram initData not available for ad reward.");
        return;
    }
    const watchAdButton = document.getElementById('watch-ad-button');
    if (watchAdButton) watchAdButton.disabled = true;

    if (!window.Telegram.WebApp.showAd) {
        alert("Telegram Ad feature not available.");
        if (watchAdButton) watchAdButton.disabled = false;
        return;
    }

    try {
        await window.Telegram.WebApp.showAd(); // Show ad first
        // If ad is closed (promise resolves), then call backend for reward
        const payload = { userId: tgUserId, initData: window.Telegram.WebApp.initData };
        const response = await fetch(`${API_BASE_URL}/api/awardAdReward`, { // <-- CORRECTED
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (response.ok && data.success) {
            alert(data.message);
            document.getElementById('horseshoes-balance').textContent = data.newHorseshoeBalance.toString();
        } else {
            alert(`Failed to get ad reward: ${data.error || 'Error'} (Status: ${response.status})`);
        }
    } catch (error) { // Catches errors from showAd OR fetch
        console.error('Error during ad process or reward:', error);
        alert(`Ad process error: ${error.message || 'Unknown issue'}`);
    } finally {
        if (watchAdButton) watchAdButton.disabled = false;
    }
}

window.addEventListener('load', () => {
    if (window.Telegram && window.Telegram.WebApp) {
        const tg = window.Telegram.WebApp;
        tg.ready();
        tg.expand();

        if (tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initData) {
            tgUser = tg.initDataUnsafe.user;
            tgUserId = tgUser.id.toString();
            console.log("Telegram.WebApp.initData:", window.Telegram.WebApp.initData); // For debugging
            fetchGameData(tgUserId);
        } else {
            console.warn('Telegram user data or initData not available. App may not function correctly.');
            updatePlayerInfoDisplay('Not in Telegram / No InitData', 0, 0);
            renderNftFragmentList();
            renderUserCraftedNfts();
        }

        const claimDailyBonusButton = document.getElementById('claim-daily-bonus');
        if (claimDailyBonusButton) claimDailyBonusButton.addEventListener('click', handleClaimDailyBonus);

        const placeBetHorseshoesButton = document.getElementById('place-bet-horseshoes');
        if (placeBetHorseshoesButton) placeBetHorseshoesButton.addEventListener('click', handleFreeBet);

        const placeBetStarsButton = document.getElementById('place-bet-stars');
        if (placeBetStarsButton) placeBetStarsButton.addEventListener('click', handleStarBet);
        
        const watchAdButton = document.getElementById('watch-ad-button');
        // The original had awardAdRewardApiCall, but it should be handleWatchAd if that's the entry point
        // I've combined them above into awardAdRewardApiCall which now includes showAd()
        if (watchAdButton) watchAdButton.addEventListener('click', awardAdRewardApiCall); 

    } else {
        console.error('Telegram WebApp SDK (window.Telegram.WebApp) not found.');
        updatePlayerInfoDisplay('Error: SDK missing', 0, 0);
        renderNftFragmentList();
        renderUserCraftedNfts();
    }
});
