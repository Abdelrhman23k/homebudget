import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, onSnapshot, collection, getDocs, deleteDoc, addDoc, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Constants ---
const CONSTANTS = {
    MODAL_IDS: {
        category: 'categoryModalOverlay',
        transaction: 'transactionModalOverlay',
        archivedDetails: 'archivedMonthDetailsModalOverlay',
        confirm: 'confirmModalOverlay',
        manageItems: 'manageItemsModalOverlay',
        manageSubcategories: 'manageSubcategoriesModalOverlay'
    }
};

// --- Firebase Configuration ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : { apiKey: "AIzaSyAnDwriW_zqBkZDrdLcDrg82f5_UoJzeUE", authDomain: "home-budget-app-c4f05.firebaseapp.com", projectId: "home-budget-app-c4f05" };
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// --- Application State ---
let currentBudget = null;
let userId = null;
let isAuthReady = false;
let unsubscribeBudget = null;
let editingCategoryId = null;
let editingTransactionId = null;
let recognition = null;
let budgetChart = null;
let transactionPieChart = null;
let forecastChart = null;
let lastAddedTransactionId = null;

// --- Multi-Budget State ---
let activeBudgetId = null;
let allBudgets = {}; // Stores { id: name } for all user budgets

// --- DOM Element Cache ---
const dom = {
    loadingSpinner: document.getElementById('loadingSpinner'),
    mainContent: document.getElementById('mainContent'),
    userIdDisplay: document.getElementById('userIdDisplay'),
    userIdValue: document.getElementById('userIdValue'),
    voiceFab: document.getElementById('voiceFab'),
    tabs: document.querySelectorAll('.tab-button'),
    tabPanels: document.querySelectorAll('.tab-panel'),
    budgetControlPanel: document.getElementById('budgetControlPanel'),
    budgetSelector: document.getElementById('budgetSelector'),
};

// --- Default Data Structures ---
const defaultCategoryIcon = `<svg class="category-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.432 0l6.568-6.568a2.426 2.426 0 0 0 0-3.432L12.586 2.586z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/></svg>`;

const defaultBudget = {
    income: 27725,
    name: "Default Budget", // Add name property
    types: ['Needs', 'Wants', 'Savings'],
    paymentMethods: ['Cash', 'Credit Card', 'Bank Transfer'],
    subcategories: {
        'Coffee': ['diningOut', 'groceries'],
        'Internet': ['utilities'],
        'Pet Food': ['dogEssentials']
    },
    categories: [
        { id: 'groceries', name: 'Groceries', allocated: 6000, spent: 0, type: 'Needs', color: '#EF4444', icon: `<svg class="category-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.16"/></svg>` },
        { id: 'utilities', name: 'Utilities', allocated: 1500, spent: 0, type: 'Needs', color: '#F97316', icon: `<svg class="category-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m13 10-3 5h4l-3 5"/></svg>` },
        { id: 'homeOwnership', name: 'Home Ownership', allocated: 1675, spent: 0, type: 'Needs', color: '#EAB308', icon: `<svg class="category-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>` },
        { id: 'fuel', name: 'Fuel for Car', allocated: 2000, spent: 0, type: 'Needs', color: '#22C55E', icon: `<svg class="category-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" x2="15" y1="22" y2="22"/><line x1="4" x2="14" y1="9" y2="9"/><path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18"/><path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 5"/></svg>` },
        { id: 'healthcare', name: 'Healthcare', allocated: 700, spent: 0, type: 'Needs', color: '#14B8A6', icon: `<svg class="category-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M3.22 12H9.5l.7-1 2.1 4.2 3-10.5 1.7 5.3h1.7"/></svg>` },
        { id: 'dogEssentials', name: 'Dog Essentials', allocated: 1200, spent: 0, type: 'Needs', color: '#06B6D4', icon: `<svg class="category-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="4" r="2"/><circle cx="18" cy="8" r="2"/><circle cx="20" cy="16" r="2"/><path d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-7 0V15a5 5 0 0 1 5-5z"/><path d="M12 14v6"/><path d="M8 14v6"/><path d="M16 14v6"/></svg>` },
        { id: 'cigarettes', name: 'Cigarettes', allocated: 4500, spent: 0, type: 'Wants', color: '#3B82F6', icon: `<svg class="category-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2Z"/><path d="M2 12h2"/><path d="M20 12h2"/></svg>` },
        { id: 'gifts', name: 'Gifts', allocated: 1000, spent: 0, type: 'Wants', color: '#6366F1', icon: `<svg class="category-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" x2="12" y1="22" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>` },
        { id: 'sweetTooth', name: 'Sweet Tooth', allocated: 500, spent: 0, type: 'Wants', color: '#8B5CF6', icon: `<svg class="category-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a2.4 2.4 0 0 0-2.4 2.4c0 1.6.8 2.4 1.6 3.2.7.7 1.2 1.2 1.2 2.2v1.2c0 .4-.2.8-.4 1-.2.3-.5.5-.8.6-.7.3-1.4.2-2.1-.2-1.1-.6-2.4-1.6-3.6-2.5C4.3 9.3 3.3 8.5 2.5 7.7.8 6.1 2 3.8 3.4 2.8 4.9 1.8 7 2.4 7.8 3c.8.7 1.5 1.8 2.2 2.8.3.4.7.8 1.1 1.2.2.2.4.3.6.4.2.1.4.1.6 0 .2-.1.4-.2.6-.4.4-.4.8-.8 1.1-1.2.8-1 1.5-2.1 2.2-2.8.8-.7 2.9-1.2 4.4-0.2s2.6 3.3 1.7 4.9c-.8.8-1.8 1.6-2.9 2.4-1.2.9-2.5 1.9-3.6 2.5-1.4.8-2.9.8-4.3.2-1.4-.6-2.5-1.8-2.7-3.3v-1.2c0-1-.4-1.5-1.2-2.2-.8-.8-1.6-1.6-1.6-3.2A2.4 2.4 0 0 0 12 2z"/><path d="M12 12.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z"/></svg>` },
        { id: 'subscriptions', name: 'Subscriptions', allocated: 390, spent: 0, type: 'Wants', color: '#EC4899', icon: `<svg class="category-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>` },
        { id: 'diningOut', name: 'Dining Out', allocated: 1500, spent: 0, type: 'Wants', color: '#F43F5E', icon: `<svg class="category-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3z"/></svg>` },
        { id: 'miscWants', name: 'Miscellaneous Wants', allocated: 2260, spent: 0, type: 'Wants', color: '#64748B', icon: `<svg class="category-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><line x1="3" x2="21" y1="6" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>` },
        { id: 'savings', name: 'Savings', allocated: 4000, spent: 0, type: 'Savings', color: '#A855F7', icon: `<svg class="category-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="M8 12h7"/><path d="M12 7v10"/></svg>` },
    ],
    transactions: []
};

const categoryMapping = {
    "groceries": ["groceries", "grocery", "بقالة", "سوبر ماركت"],
    "utilities": ["utilities", "bills", "فواتير", "كهرباء", "غاز"],
    "homeOwnership": ["home", "rent", "ايجار", "صيانة"],
    "fuel": ["fuel", "gas", "بنزين"],
    "healthcare": ["health", "pharmacy", "doctor", "صيدلية", "دكتور"],
    "dogEssentials": ["dog", "pet", "كلب"],
    "cigarettes": ["cigarettes", "smoke", "سجائر"],
    "gifts": ["gifts", "presents", "هدايا"],
    "sweetTooth": ["sweets", "dessert", "حلويات"],
    "subscriptions": ["subscriptions", "netflix", "spotify", "اشتراك"],
    "diningOut": ["dining", "restaurant", "مطعم", "اكل بره"],
    "miscWants": ["misc", "miscellaneous", "shopping", "entertainment", "متفرقات", "شوبينج"],
    "savings": ["savings", "توفير", "ادخار"]
};

// --- Firebase Initialization ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- Animation Utility ---
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
        }
    });
}, { threshold: 0.1 });

// --- UI Helper Functions ---
function showNotification(message, type = 'info', duration = 3000) {
    const el = document.getElementById('inlineNotification');
    el.textContent = message;
    el.className = 'hidden';
    void el.offsetWidth;
    el.classList.add(type, 'show');
    setTimeout(() => {
        el.classList.remove('show');
        setTimeout(() => el.classList.add('hidden'), 300);
    }, duration);
}

function showModal(id) { document.getElementById(id).classList.remove('hidden'); }
function hideModal(id) { document.getElementById(id).classList.add('hidden'); }

async function showConfirmModal(title, message) {
    const modalId = CONSTANTS.MODAL_IDS.confirm;
    const modal = document.getElementById(modalId);
    modal.innerHTML = `
        <div class="custom-modal-content">
            <h2 class="custom-modal-title">${title}</h2>
            <p class="text-center text-gray-600 mb-6">${message}</p>
            <div class="custom-modal-buttons justify-center">
                <button class="custom-modal-button custom-modal-cancel">Cancel</button>
                <button class="custom-modal-button custom-modal-confirm">Confirm</button>
            </div>
        </div>`;
    showModal(modalId);
    return new Promise(resolve => {
        modal.querySelector('.custom-modal-confirm').onclick = () => { hideModal(modalId); resolve(true); };
        modal.querySelector('.custom-modal-cancel').onclick = () => { hideModal(modalId); resolve(false); };
    });
}

// --- Authentication & App Initialization ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        userId = user.uid;
        isAuthReady = true;
        dom.userIdValue.textContent = userId;
        dom.userIdDisplay.classList.remove('hidden');
        await initializeAppState();
        setupSpeechRecognition();
    } else {
        try {
            if (initialAuthToken) await signInWithCustomToken(auth, initialAuthToken);
            else await signInAnonymously(auth);
        } catch (error) {
            console.error("Authentication failed:", error);
            showNotification("Critical Error: Could not connect to the service. Please refresh.", "danger", 10000);
        }
    }
});

async function initializeAppState() {
    dom.mainContent.classList.add('hidden');
    dom.budgetControlPanel.classList.add('hidden');
    dom.loadingSpinner.classList.remove('hidden');

    await migrateOldBudgetStructure();

    const budgetsColRef = collection(db, `artifacts/${appId}/users/${userId}/budgets`);
    const budgetsSnapshot = await getDocs(budgetsColRef);
    
    allBudgets = {};
    budgetsSnapshot.forEach(doc => {
        allBudgets[doc.id] = doc.data().name || "Untitled Budget";
    });

    if (Object.keys(allBudgets).length === 0) {
        activeBudgetId = await createNewBudget("My First Budget");
    } else {
        const prefsDocRef = doc(db, `artifacts/${appId}/users/${userId}/preferences/userPrefs`);
        const prefsDoc = await getDoc(prefsDocRef);
        if (prefsDoc.exists() && allBudgets[prefsDoc.data().activeBudgetId]) {
            activeBudgetId = prefsDoc.data().activeBudgetId;
        } else {
            activeBudgetId = Object.keys(allBudgets)[0];
        }
    }
    
    populateBudgetSelector();
    await setupBudgetListener(activeBudgetId);
    dom.budgetControlPanel.classList.remove('hidden');
}

async function migrateOldBudgetStructure() {
    const oldBudgetRef = doc(db, `artifacts/${appId}/users/${userId}/budget/current`);
    const budgetsColRef = collection(db, `artifacts/${appId}/users/${userId}/budgets`);
    
    try {
        const oldBudgetSnap = await getDoc(oldBudgetRef);
        const budgetsSnapshot = await getDocs(budgetsColRef);

        if (oldBudgetSnap.exists() && budgetsSnapshot.empty) {
            showNotification("Updating your account to support multiple budgets...", "info");
            const oldBudgetData = oldBudgetSnap.data();
            oldBudgetData.name = "Default Budget";

            const newBudgetRef = await addDoc(budgetsColRef, oldBudgetData);
            await setActiveBudgetId(newBudgetRef.id);
            await deleteDoc(oldBudgetRef);
            showNotification("Account update complete!", "success");
        }
    } catch (error) {
        console.error("Migration failed: ", error);
        showNotification("Could not update account structure.", "danger");
    }
}

async function setupBudgetListener(budgetId) {
    if (unsubscribeBudget) unsubscribeBudget();

    const budgetDocRef = doc(db, `artifacts/${appId}/users/${userId}/budgets/${budgetId}`);
    
    return new Promise((resolve, reject) => {
        unsubscribeBudget = onSnapshot(budgetDocRef, (docSnap) => {
            dom.loadingSpinner.classList.add('hidden');
            dom.mainContent.classList.remove('hidden');
            
            if (docSnap.exists()) {
                currentBudget = docSnap.data();
                if (!currentBudget.transactions) currentBudget.transactions = [];
                if (!currentBudget.types) currentBudget.types = defaultBudget.types;
                renderUI();
                resolve();
            } else {
                showNotification(`Error: Could not find budget with ID ${budgetId}.`, "danger");
                initializeAppState();
                reject(new Error("Budget not found"));
            }
        }, (error) => {
            console.error(`Error listening to budget ${budgetId}:`, error);
            showNotification("Connection to data lost. Please refresh.", "danger");
            reject(error);
        });
    });
}

async function saveBudget() {
    if (!isAuthReady || !userId || !currentBudget || !activeBudgetId) return;
    const budgetDocRef = doc(db, `artifacts/${appId}/users/${userId}/budgets/${activeBudgetId}`);
    try {
        await setDoc(budgetDocRef, currentBudget);
    } catch (error) {
        console.error("Error saving budget:", error);
        showNotification("Error: Could not save changes to the cloud.", "danger");
    }
}

// --- Multi-Budget Management ---
function populateBudgetSelector() {
    dom.budgetSelector.innerHTML = '';
    for (const id in allBudgets) {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = allBudgets[id];
        dom.budgetSelector.appendChild(option);
    }
    dom.budgetSelector.value = activeBudgetId;
    document.getElementById('deleteBudgetButton').disabled = Object.keys(allBudgets).length <= 1;
}

async function setActiveBudgetId(budgetId) {
    activeBudgetId = budgetId;
    const prefsDocRef = doc(db, `artifacts/${appId}/users/${userId}/preferences/userPrefs`);
    try {
        await setDoc(prefsDocRef, { activeBudgetId: budgetId });
    } catch (error) {
        console.error("Could not save user preference:", error);
    }
}

async function handleBudgetSwitch() {
    const newBudgetId = dom.budgetSelector.value;
    if (newBudgetId === activeBudgetId) return;

    dom.mainContent.classList.add('hidden');
    dom.loadingSpinner.classList.remove('hidden');

    await setActiveBudgetId(newBudgetId);
    await setupBudgetListener(newBudgetId);
}

async function createNewBudget(name) {
    const newBudgetData = JSON.parse(JSON.stringify(defaultBudget));
    newBudgetData.name = name;
    
    const budgetsColRef = collection(db, `artifacts/${appId}/users/${userId}/budgets`);
    try {
        const docRef = await addDoc(budgetsColRef, newBudgetData);
        allBudgets[docRef.id] = name;
        populateBudgetSelector();
        showNotification(`Budget "${name}" created.`, 'success');
        return docRef.id;
    } catch (error) {
        console.error("Error creating new budget:", error);
        showNotification("Could not create new budget.", "danger");
        return null;
    }
}

async function deleteCurrentBudget() {
    if (Object.keys(allBudgets).length <= 1) {
        showNotification("You cannot delete your only budget.", "danger");
        return;
    }
    const budgetNameToDelete = allBudgets[activeBudgetId];
    const confirmed = await showConfirmModal(
        `Delete "${budgetNameToDelete}"?`,
        "This is permanent and will delete all associated data for this budget."
    );

    if (confirmed) {
        const budgetToDelRef = doc(db, `artifacts/${appId}/users/${userId}/budgets/${activeBudgetId}`);
        delete allBudgets[activeBudgetId];
        const newActiveId = Object.keys(allBudgets)[0];

        try {
            await deleteDoc(budgetToDelRef);
            showNotification(`Budget "${budgetNameToDelete}" deleted.`, "success");
            dom.budgetSelector.value = newActiveId;
            await handleBudgetSwitch();
            populateBudgetSelector();
        } catch (error) {
            console.error("Error deleting budget:", error);
            showNotification("Failed to delete budget.", "danger");
            allBudgets[activeBudgetId] = budgetNameToDelete; 
        }
    }
}


// --- Main UI Rendering Logic & Other Functions ---
function renderUI() { if (!currentBudget) return; renderSummary(); renderCategories(); populateTransactionFilters(); renderTransactionList(); renderHistoryList(); renderBudgetChart(); populateForecastDropdown(); }
function renderSummary() { const totalSpent = currentBudget.categories.reduce((sum, cat) => sum + (cat.spent || 0), 0); const overallRemaining = currentBudget.income - totalSpent; const spentPercentage = currentBudget.income > 0 ? (totalSpent / currentBudget.income) * 100 : 0; document.getElementById('totalBudgetValue').textContent = currentBudget.income.toFixed(2); document.getElementById('totalSpentValue').textContent = totalSpent.toFixed(2); const remainingEl = document.getElementById('overallRemainingValue'); remainingEl.textContent = overallRemaining.toFixed(2); remainingEl.className = `font-bold ${overallRemaining < 0 ? 'text-red-600' : 'text-green-600'}`; const overallProgressBar = document.getElementById('overallProgressBar'); requestAnimationFrame(() => { overallProgressBar.parentElement.style.transform = 'scaleX(1)'; overallProgressBar.style.width = `${Math.min(100, spentPercentage)}%`; }); }
function renderCategories() { const container = document.getElementById('categoryDetailsContainer'); container.innerHTML = ''; const types = currentBudget.types || defaultBudget.types; types.forEach(type => { const categoriesOfType = currentBudget.categories.filter(c => c.type === type); if (categoriesOfType.length === 0) return; const section = document.createElement('div'); section.className = 'mb-6'; const title = document.createElement('h3'); title.className = 'text-xl sm:text-2xl font-bold text-gray-800 mb-4 pl-1 will-animate'; title.textContent = type; section.appendChild(title); observer.observe(title); const grid = document.createElement('div'); grid.className = 'grid grid-cols-1 md:grid-cols-2 gap-4'; section.appendChild(grid); categoriesOfType.forEach((category, index) => { const card = createCategoryCard(category); card.classList.add('will-animate'); card.style.transitionDelay = `${index * 50}ms`; grid.appendChild(card); observer.observe(card); }); container.appendChild(section); }); attachCategoryEventListeners(); updateTransactionCategoryDropdown(); }
function createCategoryCard(category) { const card = document.createElement('div'); const spent = category.spent || 0; const allocated = category.allocated || 0; const remaining = allocated - spent; const percentage = allocated > 0 ? (spent / allocated) * 100 : 0; card.className = 'category-card'; card.style.borderColor = category.color || '#cccccc'; card.dataset.categoryId = category.id; card.innerHTML = `...`; /* FULL HTML from previous version */ const progressBarContainer = card.querySelector('.progress-bar-container'); requestAnimationFrame(() => { progressBarContainer.style.transform = 'scaleX(1)'; }); return card; }
function attachCategoryEventListeners() { /* ... same as before ... */ }
function updateTransactionCategoryDropdown() { /* ... same as before ... */ }
async function handleDeleteCategory(categoryId) { /* ... same as before ... */ }
function openCategoryModal(category = null) { /* ... same as before ... */ }
async function handleCategoryFormSubmit(e) { /* ... same as before ... */ }
function openTransactionModal(transaction = null) { /* ... same as before ... */ }
function updateSubcategoryDropdown(categoryId, selectedSubcategory) { /* ... same as before ... */ }
async function handleTransactionFormSubmit(e) { e.preventDefault(); const newTransactionId = editingTransactionId || `trans-${Date.now()}`; const newTransaction = { id: newTransactionId, amount: parseFloat(document.getElementById('modalTransactionAmount').value), categoryId: document.getElementById('modalTransactionCategory').value, subcategory: document.getElementById('modalTransactionSubcategory').value, paymentMethod: document.getElementById('modalTransactionPaymentMethod').value, description: document.getElementById('modalTransactionDescription').value, date: document.getElementById('modalTransactionDate').value, }; if (editingTransactionId) { const index = currentBudget.transactions.findIndex(t => t.id === editingTransactionId); if (index > -1) currentBudget.transactions[index] = newTransaction; } else { currentBudget.transactions.push(newTransaction); lastAddedTransactionId = newTransactionId; } recalculateSpentAmounts(); await saveBudget(); hideModal(CONSTANTS.MODAL_IDS.transaction); editingTransactionId = null; showNotification('Transaction saved.', 'success'); }
function recalculateSpentAmounts() { /* ... same as before ... */ }
function formatTimestamp(isoString) { /* ... same as before ... */ }
function renderTransactionList() { /* ... same as before, with animation logic included ... */ }
function populateTransactionFilters() { /* ... corrected version from before ... */ }
async function renderHistoryList() { const historyList = document.getElementById('monthlyHistoryList'); if (!historyList || !activeBudgetId) return; historyList.innerHTML = '<div class="spinner"></div>'; const archiveColRef = collection(db, `artifacts/${appId}/users/${userId}/budgets/${activeBudgetId}/archive`); try { const snapshot = await getDocs(archiveColRef); historyList.innerHTML = ''; if (snapshot.empty) { historyList.innerHTML = '<p class="text-gray-500 text-center">No archives found.</p>'; return; } snapshot.docs.sort((a, b) => b.id.localeCompare(a.id)).forEach(doc => { const monthItem = document.createElement('div'); monthItem.className = 'bg-white p-3 rounded-lg flex justify-between items-center shadow-sm'; monthItem.innerHTML = `<span class="font-semibold">${doc.id}</span> <button data-archive-id="${doc.id}" class="view-archive-btn btn bg-indigo-500 hover:bg-indigo-600 btn-sm py-1 px-3">View</button>`; historyList.appendChild(monthItem); }); } catch (error) { console.error("Error fetching archives:", error); historyList.innerHTML = '<p class="text-red-500 text-center">Could not load history.</p>'; showNotification("Failed to load budget history.", "danger"); } }
function renderArchivedMonthDetails(archiveId, data) { /* ... same as before ... */ }
function setupSpeechRecognition() { /* ... same as before ... */ }
function processVoiceCommand(transcript) { /* ... same as before, but with lastAddedTransactionId set ... */ }
async function renderBudgetChart() { const chartContainer = document.getElementById('chartContainer'); if (!chartContainer || !activeBudgetId) return; chartContainer.innerHTML = '<div class="spinner"></div>'; const archiveColRef = collection(db, `artifacts/${appId}/users/${userId}/budgets/${activeBudgetId}/archive`); try { const snapshot = await getDocs(archiveColRef); if (snapshot.docs.length < 2) { chartContainer.innerHTML = '<p class="text-gray-500 text-center">Not enough data to display a chart. Archive at least two months.</p>'; return; } const archives = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => a.id.localeCompare(b.id)); const labels = archives.map(archive => archive.id); const totalSpentData = archives.map(archive => (archive.categories || []).reduce((sum, cat) => sum + (cat.spent || 0), 0)); const incomeData = archives.map(archive => archive.income || 0); chartContainer.innerHTML = '<canvas id="budgetChartCanvas"></canvas>'; const ctx = document.getElementById('budgetChartCanvas').getContext('2d'); if (budgetChart) budgetChart.destroy(); budgetChart = new Chart(ctx, { type: 'line', data: { labels: labels, datasets: [ { label: 'Total Spent', data: totalSpentData, borderColor: '#EF4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', fill: true, tension: 0.2 }, { label: 'Total Budget', data: incomeData, borderColor: '#22C55E', backgroundColor: 'rgba(34, 197, 94, 0.1)', fill: false, tension: 0.2, borderDash: [5, 5] } ] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { callback: value => `${value} EGP` } } }, plugins: { legend: { position: 'top' }, title: { display: true, text: 'Monthly Spending vs. Budget' } } } }); } catch (error) { console.error("Error fetching archives for chart:", error); chartContainer.innerHTML = '<p class="text-red-500 text-center">Could not load chart data.</p>'; showNotification("Failed to load history chart.", "danger"); } }
function renderPieChart(canvasId, budgetData, groupBy) { /* ... same as before ... */ }
function renderTransactionPieChart(filteredTransactions) { /* ... same as before ... */ }
function populateForecastDropdown() { /* ... same as before ... */ }
function calculateForecast() { /* ... same as before ... */ }
function openManagementModal({ modalId, title, itemsKey, placeholder, onAdd, onDelete }){/* ... same as before ... */}
async function handleDeleteTransaction(transactionId) { /* ... same as before ... */ }

initializeEventListeners();
