// script.js
let tgUser = null;
let tgUserId = null;

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
        updatePlayerInfoDisplay(currentUserId, 0, 0); // Default display
        return;
    }

    // Update UI to show loading state
    updatePlayerInfoDisplay(currentUserId, 'Loading...', 'Loading...');

    try {
        const response = await fetch(`/api/getUserData?userId=${currentUserId}`); // Using the new endpoint

        if (!response.ok) {
            console.warn(`Failed to fetch initial user data: ${response.status}. Response: ${await response.text()}`);
            // If user not found by backend's getOrCreateUser (which /api/getUserData uses),
            // it means the user truly doesn't exist yet or there was another issue.
            // getOrCreateUser should create them and return default values.
            // So, a non-ok response here might be a server error or unexpected issue.
            updatePlayerInfoDisplay(currentUserId, 0, 0); // Default on error or if user is truly new and endpoint didn't return defaults
            return;
        }

        const data = await response.json();

        if (data && data.success) {
            // Update UI with fetched data
            updatePlayerInfoDisplay(currentUserId, data.horseshoes, data.totalNftFragments);

            // Store detailed fragments if needed elsewhere, e.g., for crafting UI
            // For now, just logging them. The crafting UI will need this.
            console.log("User Fragments Detailed:", data.fragments);
            // You might want to store `data.fragments` in a global variable if the crafting UI needs it dynamically.
            // e.g., window.userNftFragments = data.fragments;
        } else {
            console.warn("Received non-successful response or malformed data from /api/getUserData", data);
            updatePlayerInfoDisplay(currentUserId, 0, 0); // Default if data is not as expected
        }

    } catch (error) {
        console.error("Error fetching initial game data from /api/getUserData:", error);
        updatePlayerInfoDisplay(currentUserId, 'Error', 'Error'); // Display error state in UI
    }
}

// FUNCTION for handling daily bonus claim (Keep as is from previous step)
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
                // Update horseshoe balance on the UI
                const horseshoeBalanceElement = document.getElementById('horseshoes-balance');
                if (horseshoeBalanceElement) {
                    horseshoeBalanceElement.textContent = data.newHorseshoeBalance.toString();
                }
                alert(`Bonus claimed! You got ${data.bonusAmount} horseshoes.`);
            } else {
                // Already claimed or other non-error failure
                alert(data.message);
            }
        } else {
            // HTTP error (e.g., 500 server error)
            dailyBonusMessageElement.textContent = `Error: ${data.error || 'Failed to claim bonus.'}`;
            alert(`Error claiming bonus: ${data.error || response.statusText}`);
        }
    } catch (error) {
        console.error('Error claiming daily bonus:', error);
        dailyBonusMessageElement.textContent = 'An error occurred. Please try again.';
        alert('An error occurred while claiming the bonus.');
    }
}

// FUNCTION for handling free bets (horseshoes) - Keep as is from previous step
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

    if (isNaN(horseId) || horseId < 1 || horseId > 5) { // Assuming 5 horses
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
                fetchGameData(tgUserId);
            }

            winnerInfoElement.textContent = resultMessage;
            alert(resultMessage);

            const horseshoeBalanceElement = document.getElementById('horseshoes-balance');
            if (horseshoeBalanceElement) {
                horseshoeBalanceElement.textContent = data.updatedHorseshoeBalance.toString();
            }

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


window.addEventListener('load', () => {
    if (window.Telegram && window.Telegram.WebApp) {
        const tg = window.Telegram.WebApp;
        tg.ready();
        tg.expand();

        if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
            tgUser = tg.initDataUnsafe.user;
            tgUserId = tgUser.id.toString();
            console.log('Telegram User:', tgUser);
            fetchGameData(tgUserId);
        } else {
            console.warn('Telegram user data not available.');
            updatePlayerInfoDisplay('Not in Telegram', 0, 0);
            // tgUserId = prompt("Enter a test User ID:", "testUser123");
            // if (tgUserId) fetchGameData(tgUserId);
        }

        console.log('Telegram WebApp SDK initialized. User ID:', tgUserId);

        const claimDailyBonusButton = document.getElementById('claim-daily-bonus');
        if (claimDailyBonusButton) {
            claimDailyBonusButton.addEventListener('click', handleClaimDailyBonus);
        }

        const placeBetHorseshoesButton = document.getElementById('place-bet-horseshoes');
        if (placeBetHorseshoesButton) {
            placeBetHorseshoesButton.addEventListener('click', handleFreeBet);
        }

    } else {
        console.error('Telegram WebApp SDK (window.Telegram.WebApp) not found.');
        updatePlayerInfoDisplay('Error: SDK missing', 0, 0);
    }
});
