// script.js
const API_BASE_URL = ''; // Define to default to relative paths

let tgUser = null;
let tgUserId = null;

// Store detailed fragments and crafted NFTs globally for UI updates
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
        const response = await fetch(`${API_BASE_URL}/api/getUserData?userId=${currentUserId}`);

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
        const payload = {
            userId: tgUserId,
            initData: window.Telegram.WebApp.initData
        };
        const response = await fetch(`${API_BASE_URL}/api/claimDailyBonus`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
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
            dailyBonusMessageElement.textContent = `Error: ${data.error || 'Failed to claim bonus.'} (Status: ${response.status})`;
            alert(`Error claiming bonus: ${data.error || response.statusText}`);
        }
    } catch (error) {
        console.error('Error claiming daily bonus:', error);
        dailyBonusMessageElement.textContent = 'An error occurred. Please try again.';
        alert('An error occurred while claiming the bonus.');
    }
}

function showWinnerScreen(winnerData) {
    const overlay = document.getElementById('winner-screen-overlay');
    const winTextElement = document.getElementById('win-text');
    const detailsElement = document.getElementById('winning-turtle-details');
    const turtleDisplayElement = document.getElementById('winner-turtle-display');
    const playAgainButton = document.getElementById('play-again-button');

    if (!overlay || !winTextElement || !detailsElement || !turtleDisplayElement || !playAgainButton) {
        console.error("Winner screen elements not found! Falling back to alert.");
        alert(`Official Winner: ${winnerData.name} (ID: ${winnerData.id})!`);
        return;
    }
    const turtleColors = { "1": "#ef5350", "2": "#42a5f5", "3": "#66bb6a", "4": "#ffee58" };
    // @ts-ignore
    const winnerColor = turtleColors[winnerData.id.toString()] || '#4CAF50';

    winTextElement.textContent = "WINNER!"; // Changed text slightly
    winTextElement.style.color = winnerColor;
    detailsElement.textContent = `${winnerData.name} is the champion turtle!`;

    turtleDisplayElement.style.backgroundColor = winnerColor;
    turtleDisplayElement.textContent = `T${winnerData.id}`;
    // @ts-ignore
    turtleDisplayElement.style.color = (winnerData.id.toString() === "4") ? "#333" : "white";

    overlay.classList.remove('hidden');
    playAgainButton.onclick = () => {
        overlay.classList.add('hidden');
        const winnerInfoEl = document.getElementById('turtle-winner-info');
        if (winnerInfoEl) winnerInfoEl.textContent = 'Select a turtle for the next race!';
    };
}

function startTurtleRaceAnimation(userSelectedTurtleIdStr) { // Renamed param for clarity
    console.log("Starting turtle race animation. User selected Turtle ID:", userSelectedTurtleIdStr);
    const trackElement = document.querySelector('.track');
    if (!trackElement) {
        console.error("Track element not found for animation.");
        return Promise.reject("Track element not found");
    }
    const turtles = [
        document.getElementById('turtle-racer-1'), document.getElementById('turtle-racer-2'),
        document.getElementById('turtle-racer-3'), document.getElementById('turtle-racer-4')
    ].filter(t => t !== null);
    if (turtles.length !== 4) {
        console.error("Could not find all 4 turtle racer elements.");
        return Promise.reject("Could not find all 4 turtle racers.");
    }

    turtles.forEach(turtle => {
        if (turtle) {
            turtle.style.left = '10px'; // Consistent with new CSS initial left
            turtle.classList.remove('selected-turtle', 'visual-winner'); // Clear previous classes
            if (turtle.dataset.turtleId === userSelectedTurtleIdStr) {
                turtle.classList.add('selected-turtle');
            }
        }
    });

    const winnerInfoEl = document.getElementById('turtle-winner-info'); // Renamed for consistency
    if (winnerInfoEl) {
        winnerInfoEl.textContent = 'The turtles are off!';
    }

    const trackWidth = trackElement.clientWidth;
    const finishLineX = trackWidth * 0.88; // Adjusted slightly, this is visual only
    // Add a comment: Finish line is approximate for visual animation. Real winner from backend.
    console.log(`Track width: ${trackWidth}px, Visual Finish line for animation at approx: ${finishLineX}px`);

    return new Promise((resolve) => {
        let animationFrameId = null;
        let visualWinnerFoundId = null;

        function raceStep() {
            if (visualWinnerFoundId) {
                if (animationFrameId) cancelAnimationFrame(animationFrameId);
                resolve(visualWinnerFoundId);
                return;
            }
            for (const turtle of turtles) {
                if (!turtle) continue;
                const currentLeft = parseFloat(turtle.style.left || '10');
                const move = Math.floor(Math.random() * 7) + 2; // Moves 2-8 pixels
                const newLeft = currentLeft + move;
                turtle.style.left = `${newLeft}px`;
                if (newLeft >= finishLineX) {
                    visualWinnerFoundId = turtle.dataset.turtleId || null;
                    console.log(`Visual winner of animation: Turtle ${visualWinnerFoundId}`);
                    if (turtle) turtle.classList.add('visual-winner');
                    if (animationFrameId) cancelAnimationFrame(animationFrameId);
                    resolve(visualWinnerFoundId);
                    return;
                }
            }
            animationFrameId = requestAnimationFrame(raceStep);
        }
        animationFrameId = requestAnimationFrame(raceStep);
    });
}

async function handleFreeBet() {
    if (!tgUserId || !window.Telegram?.WebApp?.initData) {
        alert("User ID or Telegram initData not available. Cannot place bet.");
        return;
    }
    const turtleSelectElement = document.getElementById('turtle-select');
    const betAmountElement = document.getElementById('bet-amount-horseshoes');
    const placeBetButton = document.getElementById('place-bet-horseshoes');
    const winnerInfoEl = document.getElementById('turtle-winner-info');

    const selectedTurtleIdStr = turtleSelectElement.value;
    const betAmount = parseInt(betAmountElement.value);

    if (isNaN(parseInt(selectedTurtleIdStr)) || parseInt(selectedTurtleIdStr) < 1 || parseInt(selectedTurtleIdStr) > 4) {
        alert("Please select a valid turtle."); return;
    }
    if (isNaN(betAmount) || betAmount <= 0) {
        alert("Please enter a valid bet amount."); return;
    }

    turtleSelectElement.disabled = true;
    betAmountElement.disabled = true;
    if(placeBetButton) placeBetButton.disabled = true;
    if (winnerInfoEl) winnerInfoEl.textContent = 'Preparing the race...';

    try {
        const visualWinnerId = await startTurtleRaceAnimation(selectedTurtleIdStr);
        if (winnerInfoEl) {
            winnerInfoEl.textContent = `Turtle ${visualWinnerId} visually finished first! Awaiting official results...`;
        }
        await new Promise(resolve => setTimeout(resolve, 1200));

        const payload = {
            userId: tgUserId, horseId: parseInt(selectedTurtleIdStr),
            betAmount: betAmount, initData: window.Telegram.WebApp.initData
        };
        const response = await fetch(`${API_BASE_URL}/api/freeBet`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
        const data = await response.json();

        if (response.ok) {
            if (data.won) {
                showWinnerScreen(data.winner);
                if (winnerInfoEl) winnerInfoEl.textContent = `Congratulations! ${data.winner.name} won! You get ${data.winnings} horseshoes.`;
            } else {
                if (winnerInfoEl) winnerInfoEl.textContent = `Official Result: ${data.winner.name} wins. Your turtle, ${turtleSelectElement.options[turtleSelectElement.selectedIndex].text}, didn't win.`;
                alert(`Sorry! ${data.winner.name} won the race. Better luck next time!`);
            }
            if (data.fragmentAwarded) {
                alert(`Bonus! You also received an NFT fragment for ${data.awardedNftFragmentId}!`);
                fetchGameData(tgUserId);
            }
            document.getElementById('horseshoes-balance').textContent = data.updatedHorseshoeBalance.toString();
        } else {
            if (winnerInfoEl) winnerInfoEl.textContent = `Race Error: ${data.error || 'Failed to get results.'} (Status: ${response.status})`;
            alert(`Error getting race results: ${data.error || response.statusText}`);
            fetchGameData(tgUserId);
        }
    } catch (error) {
        console.error('Error during free bet process:', error);
        if (winnerInfoEl) winnerInfoEl.textContent = 'An error occurred. Please try again.';
        alert('An error occurred during the race process.');
        fetchGameData(tgUserId);
    } finally {
        turtleSelectElement.disabled = false;
        betAmountElement.disabled = false;
        if(placeBetButton) placeBetButton.disabled = false;
        document.querySelectorAll('.turtle-racer').forEach(t => {
            t.classList.remove('selected-turtle', 'visual-winner');
        });
    }
}

async function handleStarBet() {
    if (!tgUserId || !window.Telegram?.WebApp?.initData) {
        alert("User ID or Telegram initData not available. Cannot make a stars payment.");
        return;
    }

    const betAmountStarsElement = document.getElementById('bet-amount-stars');
    const starsToSpend = parseInt(betAmountStarsElement.value);

    if (isNaN(starsToSpend) || starsToSpend <= 0) {
        alert("Please enter a valid amount of stars to spend.");
        return;
    }

    const winnerInfoElement = document.getElementById('turtle-winner-info');
    winnerInfoElement.textContent = `Processing payment for ${starsToSpend} stars...`;
    alert(`Simulating Telegram Stars payment for ${starsToSpend} stars. In a real app, the Telegram payment UI would open.`);

    try {
        const payload = {
            userId: tgUserId,
            starsAmount: starsToSpend,
            initData: window.Telegram.WebApp.initData
        };
        const response = await fetch(`${API_BASE_URL}/api/awardStarFragments`, {
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
        const errorMessage = 'An error occurred during the star payment process. Please try again.';
        winnerInfoElement.textContent = errorMessage;
        alert(errorMessage);
    }
}

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

async function handleCraftNft(event) {
    if (!tgUserId || !window.Telegram?.WebApp?.initData) {
        alert("User ID or Telegram initData not available. Cannot craft NFT.");
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
        const payload = {
            userId: tgUserId,
            nftIdToCraft: nftIdToCraft,
            initData: window.Telegram.WebApp.initData
        };
        const response = await fetch(`${API_BASE_URL}/api/craftNft`, {
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
            craftingStatusMessageElement.textContent = `Crafting failed: ${data.message || 'Unknown error'} (Status: ${response.status})`;
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

async function handleWatchAd() {
    if (!tgUserId || !window.Telegram?.WebApp?.initData) {
        alert("User ID or Telegram initData not available. Cannot process ad reward.");
        return;
    }

    if (!window.Telegram.WebApp.showAd) {
        alert("Telegram Ad feature is not available in this environment.");
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

async function awardAdRewardApiCall() {
    const watchAdButton = document.getElementById('watch-ad-button');
    try {
        const payload = {
            userId: tgUserId,
            initData: window.Telegram.WebApp.initData
        };
        const response = await fetch(`${API_BASE_URL}/api/awardAdReward`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const data = await response.json();

        if (response.ok && data.success) {
            alert(data.message);
            const horseshoeBalanceElement = document.getElementById('horseshoes-balance');
            if (horseshoeBalanceElement) {
                horseshoeBalanceElement.textContent = data.newHorseshoeBalance.toString();
            }
        } else {
            alert(`Failed to get reward: ${data.error || 'Unknown error'} (Status: ${response.status})`);
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

        if (tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initData) {
            tgUser = tg.initDataUnsafe.user;
            tgUserId = tgUser.id.toString();
            console.log("Telegram.WebApp.initData:", window.Telegram.WebApp.initData);
            fetchGameData(tgUserId);
        } else {
            console.warn('Telegram user data or initData not available.');
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
