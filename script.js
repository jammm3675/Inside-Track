// script.js
let tgUser = null;
let tgUserId = null;

// Store detailed fragments and crafted NFTs globally for UI updates
let userOwnedFragments = [];
let userCraftedNfts = []; // To be populated from getUserData if we add that to backend

function updatePlayerInfoDisplay(userId, horseshoes, totalNftFragments) { // Modified to accept totalNftFragments
    const userIdElement = document.getElementById('user-id');
    const horseshoeBalanceElement = document.getElementById('horseshoes-balance');
    const nftFragmentsBalanceElement = document.getElementById('nft-fragments-balance'); // This will show total fragments

    if (userIdElement) userIdElement.textContent = userId || 'N/A';
    if (horseshoeBalanceElement) horseshoeBalanceElement.textContent = horseshoes !== undefined ? horseshoes.toString() : 'N/A';
    // Display total NFT fragments
    if (nftFragmentsBalanceElement) nftFragmentsBalanceElement.textContent = totalNftFragments !== undefined ? totalNftFragments.toString() : 'N/A';
}

async function fetchGameData(currentUserId) {
    if (!currentUserId) {
        console.log("User ID not available, cannot fetch game data initially.");
        updatePlayerInfoDisplay(currentUserId, 0, 0);
        renderNftFragmentList(); // Render empty/default state
        renderUserCraftedNfts(); // Render empty/default state
        return;
    }

    updatePlayerInfoDisplay(currentUserId, 'Loading...', 'Loading...');
    // Also indicate loading in the specific list areas
    const fragmentListDiv = document.getElementById('nft-fragment-list');
    if (fragmentListDiv) fragmentListDiv.innerHTML = '<p>Loading your fragments...</p>';
    const collectionListDiv = document.getElementById('user-nft-collection-list');
    if (collectionListDiv) collectionListDiv.innerHTML = '<p>Loading your collection...</p>';

    try {
        const response = await fetch(`/api/getUserData?userId=${currentUserId}`);
        if (!response.ok) {
            console.warn(`Failed to fetch initial user data: ${response.status}. Response: ${await response.text()}`);
            updatePlayerInfoDisplay(currentUserId, 0, 0);
            userOwnedFragments = []; // Reset
            userCraftedNfts = []; // Reset
            renderNftFragmentList();
            renderUserCraftedNfts();
            return;
        }

        const data = await response.json();
        if (data && data.success) {
            updatePlayerInfoDisplay(currentUserId, data.horseshoes, data.totalNftFragments);
            userOwnedFragments = data.fragments || []; // Store for crafting UI
            userCraftedNfts = data.craftedNfts || []; // Assuming getUserData will also return crafted NFTs

            renderNftFragmentList();
            renderUserCraftedNfts(); // Render the user's collection of crafted NFTs

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

// FUNCTION for handling daily bonus claim
async function handleClaimDailyBonus() {
    if (!tgUserId) {
        alert("User ID not available. Cannot claim bonus.");
        return;
    }

    const dailyBonusMessageElement = document.getElementById('daily-bonus-message');
    dailyBonusMessageElement.textContent = 'Claiming...';

    try {
        const response = await fetch('/api/claimDailyBonus', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ userId: tgUserId }),
        });

        const data = await response.json();

        if (response.ok) {
            dailyBonusMessageElement.textContent = data.message;
            if (data.success) {
                const horseshoeBalanceElement = document.getElementById('horseshoes-balance');
                if (horseshoeBalanceElement) {
                    horseshoeBalanceElement.textContent = data.newHorseshoeBalance.toString();
                }
                alert(`Bonus claimed! You got ${data.bonusAmount} horseshoes.`);
            } else {
                alert(data.message);
            }
        } else {
            dailyBonusMessageElement.textContent = `Error: ${data.error || 'Failed to claim bonus.'}`;
            alert(`Error claiming bonus: ${data.error || response.statusText}`);
        }
    } catch (error) {
        console.error('Error claiming daily bonus:', error);
        dailyBonusMessageElement.textContent = 'An error occurred. Please try again.';
        alert('An error occurred while claiming the bonus.');
    }
}

// FUNCTION for handling free bets (horseshoes)
async function handleFreeBet() {
    if (!tgUserId) {
        alert("User ID not available. Cannot place bet.");
        return;
    }

    const horseSelectElement = document.getElementById('horse-select');
    const betAmountElement = document.getElementById('bet-amount-horseshoes');
    const winnerInfoElement = document.getElementById('winner-info');

    const horseId = parseInt(horseSelectElement.value);
    const betAmount = parseInt(betAmountElement.value);

    if (isNaN(horseId) || horseId < 1 || horseId > 5) {
        alert("Please select a valid horse.");
        return;
    }
    if (isNaN(betAmount) || betAmount <= 0) {
        alert("Please enter a valid bet amount.");
        return;
    }

    winnerInfoElement.textContent = 'Racing...';

    try {
        const response = await fetch('/api/freeBet', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                userId: tgUserId,
                horseId: horseId,
                betAmount: betAmount,
            }),
        });

        const data = await response.json();

        if (response.ok) {
            let resultMessage = `Race finished! Winner: Horse ${data.winner.id} (${data.winner.name}). `;
            if (data.won) {
                resultMessage += `Congratulations! You won ${data.winnings} horseshoes.`;
            } else {
                resultMessage += `Better luck next time!`;
            }

            if (data.fragmentAwarded) {
                resultMessage += ` You also received an NFT fragment for ${data.awardedNftFragmentId}!`;
            }

            winnerInfoElement.textContent = resultMessage;
            alert(resultMessage);

            const horseshoeBalanceElement = document.getElementById('horseshoes-balance');
            if (horseshoeBalanceElement) {
                horseshoeBalanceElement.textContent = data.updatedHorseshoeBalance.toString();
            }
            fetchGameData(tgUserId);

        } else {
            winnerInfoElement.textContent = `Error: ${data.error || 'Failed to place bet.'}`;
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

// FUNCTION for handling star bets (paid mode)
async function handleStarBet() {
    if (!tgUserId) {
        alert("User ID not available. Cannot make a stars payment.");
        return;
    }

    const betAmountStarsElement = document.getElementById('bet-amount-stars');
    const starsToSpend = parseInt(betAmountStarsElement.value);

    if (isNaN(starsToSpend) || starsToSpend <= 0) {
        alert("Please enter a valid amount of stars to spend.");
        return;
    }

    const winnerInfoElement = document.getElementById('winner-info');
    winnerInfoElement.textContent = `Processing payment for ${starsToSpend} stars...`;
    alert(`Simulating Telegram Stars payment for ${starsToSpend} stars. In a real app, the Telegram payment UI would open.`);

    try {
        const response = await fetch('/api/awardStarFragments', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                userId: tgUserId,
                starsAmount: starsToSpend
            }),
        });

        const data = await response.json();

        if (response.ok && data.success) {
            const message = `Payment successful! You received ${data.awardedFragmentsCount} NFT fragments.`;
            winnerInfoElement.textContent = message;
            alert(message);
            fetchGameData(tgUserId);
        } else {
            const errorMessage = `Star payment process failed: ${data.error || 'Unknown error'}`;
            winnerInfoElement.textContent = errorMessage;
            alert(errorMessage);
        }
    } catch (error) {
        console.error('Error during star bet process:', error);
        const errorMessage = 'An error occurred during the star payment process. Please try again.';
        winnerInfoElement.textContent = errorMessage;
        alert(errorMessage);
    }
}

// FUNCTION to render NFT fragment list and craft buttons
function renderNftFragmentList() {
    const fragmentListDiv = document.getElementById('nft-fragment-list');
    if (!fragmentListDiv) return;

    if (userOwnedFragments === undefined) {
        fragmentListDiv.innerHTML = '<p>Loading your fragments...</p>';
        return;
    }
    if (userOwnedFragments.length === 0) {
        fragmentListDiv.innerHTML = '<p>You have no NFT fragments yet. Win races or use Stars to get some!</p>';
        return;
    }

    let html = '<ul>';
    userOwnedFragments.forEach(fragment => {
        const canCraft = fragment.count >= 15;
        const isCrafted = userCraftedNfts.some(craftedNft => craftedNft.nft_id === fragment.nft_id);

        html += `<li>
            ${fragment.nft_id}: ${fragment.count} / 15 fragments
            ${isCrafted ? '<span style="color: green;">(Already Crafted)</span>' : (canCraft ? `<button class="craft-button" data-nftid="${fragment.nft_id}">Craft NFT</button>` : '<span style="color: orange;">(Need more fragments)</span>')}
        </li>`;
    });
    html += '</ul>';
    fragmentListDiv.innerHTML = html;

    document.querySelectorAll('.craft-button').forEach(button => {
        button.addEventListener('click', handleCraftNft);
    });
}

// FUNCTION to render user's collection of CRAFTED NFTs
function renderUserCraftedNfts() {
    const collectionListDiv = document.getElementById('user-nft-collection-list');
    if (!collectionListDiv) return;

    if (userCraftedNfts === undefined) {
        collectionListDiv.innerHTML = '<p>Loading your collection...</p>';
        return;
    }
    if (userCraftedNfts.length === 0) {
        collectionListDiv.innerHTML = '<p>No NFTs crafted yet. Craft one to see it here!</p>';
        return;
    }

    let html = '<ul>';
    userCraftedNfts.forEach(nft => {
        html += `<li>${nft.nft_id} (Crafted on: ${new Date(nft.crafted_at).toLocaleDateString()})</li>`;
    });
    html += '</ul>';
    collectionListDiv.innerHTML = html;
}

// FUNCTION to handle NFT crafting event
async function handleCraftNft(event) {
    if (!tgUserId) {
        alert("User ID not available. Cannot craft NFT.");
        return;
    }
    const nftIdToCraft = event.target.dataset.nftid;
    if (!nftIdToCraft) {
        alert("No NFT ID specified for crafting.");
        return;
    }

    const craftingStatusMessageElement = document.getElementById('crafting-status-message');
    craftingStatusMessageElement.textContent = `Attempting to craft ${nftIdToCraft}...`;
    event.target.disabled = true;

    try {
        const response = await fetch('/api/craftNft', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                userId: tgUserId,
                nftIdToCraft: nftIdToCraft,
            }),
        });

        const data = await response.json();

        if (response.ok && data.success) {
            craftingStatusMessageElement.textContent = data.message;
            alert(data.message);
            fetchGameData(tgUserId);
        } else {
            craftingStatusMessageElement.textContent = `Crafting failed: ${data.message || 'Unknown error'}`;
            alert(`Crafting failed: ${data.message || 'Unknown error'}`);
            event.target.disabled = false;
        }
    } catch (error) {
        console.error('Error crafting NFT:', error);
        craftingStatusMessageElement.textContent = 'An error occurred during crafting. Please try again.';
        alert('An error occurred during crafting.');
        event.target.disabled = false;
    }
}

// NEW FUNCTION to handle rewarded ad flow
async function handleWatchAd() {
    if (!tgUserId) {
        alert("User ID not available. Cannot process ad reward.");
        return;
    }

    if (!window.Telegram || !window.Telegram.WebApp || !window.Telegram.WebApp.showAd) {
        alert("Telegram Ad feature is not available in this environment.");
        // Potentially call the reward API directly for testing outside Telegram
        // if (confirm("Simulate successful ad watch for testing?")) {
        //     await awardAdRewardApiCall();
        // }
        return;
    }

    const watchAdButton = document.getElementById('watch-ad-button');
    if (watchAdButton) watchAdButton.disabled = true;

    try {
        await window.Telegram.WebApp.showAd();
        await awardAdRewardApiCall();

    } catch (error) {
        console.error("Error showing ad or ad not available:", error);
        alert(`Ad could not be shown. Error: ${error.message || 'Unknown ad error'}. Please try again later.`);
        if (watchAdButton) watchAdButton.disabled = false;
    }
}

// Helper function for the API call to award ad reward
async function awardAdRewardApiCall() {
    const watchAdButton = document.getElementById('watch-ad-button');
    try {
        const response = await fetch('/api/awardAdReward', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ userId: tgUserId }),
        });

        const data = await response.json();

        if (response.ok && data.success) {
            alert(data.message);
            const horseshoeBalanceElement = document.getElementById('horseshoes-balance');
            if (horseshoeBalanceElement) {
                horseshoeBalanceElement.textContent = data.newHorseshoeBalance.toString();
            }
        } else {
            alert(`Failed to get reward: ${data.error || 'Unknown error'}`);
        }
    } catch (error) {
        console.error('Error awarding ad reward:', error);
        alert('An error occurred while trying to claim your ad reward.');
    } finally {
        if (watchAdButton) watchAdButton.disabled = false;
    }
}

window.addEventListener('load', () => {
    if (window.Telegram && window.Telegram.WebApp) {
        const tg = window.Telegram.WebApp;
        tg.ready();
        tg.expand();

        if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
            tgUser = tg.initDataUnsafe.user;
            tgUserId = tgUser.id.toString();
            fetchGameData(tgUserId);
        } else {
            updatePlayerInfoDisplay('Not in Telegram', 0, 0);
            renderNftFragmentList();
            renderUserCraftedNfts();
        }

        console.log('Telegram WebApp SDK initialized. User ID:', tgUserId);

        const claimDailyBonusButton = document.getElementById('claim-daily-bonus');
        if (claimDailyBonusButton) claimDailyBonusButton.addEventListener('click', handleClaimDailyBonus);

        const placeBetHorseshoesButton = document.getElementById('place-bet-horseshoes');
        if (placeBetHorseshoesButton) placeBetHorseshoesButton.addEventListener('click', handleFreeBet);

        const placeBetStarsButton = document.getElementById('place-bet-stars');
        if (placeBetStarsButton) placeBetStarsButton.addEventListener('click', handleStarBet);

        const watchAdButton = document.getElementById('watch-ad-button');
        if (watchAdButton) {
            watchAdButton.addEventListener('click', handleWatchAd);
        }

    } else {
        console.error('Telegram WebApp SDK (window.Telegram.WebApp) not found.');
        updatePlayerInfoDisplay('Error: SDK missing', 0, 0);
        renderNftFragmentList();
        renderUserCraftedNfts();
    }
});
