// ---------- FIREBASE CONFIG - REPLACE WITH YOUR KEYS -----------
const firebaseConfig = {
    apiKey: "AIzaSyBz0OAElYhb90qc2QJLuTsRPVtbK68IujM",
    authDomain: "nutriscan-cc2af.firebaseapp.com",
    projectId: "nutriscan-cc2af",
    storageBucket: "nutriscan-cc2af.firebasestorage.app",
    messagingSenderId: "575933823311",
    appId: "1:575933823311:web:4004a57591a6723bd96d3a",
    measurementId: "G-RD062PLLTQ"
};
// Initialize firebase (compat)
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ---------- Helper: UI refs ----------
const saveMsg = document.getElementById('saveMsg');
const resultBox = document.getElementById('productInfo');
const nutriList = document.getElementById('nutriList');
const reasonList = document.getElementById('reasonList');
const ingredientExplainer = document.getElementById('ingredientExplainer');
const adviceBox = document.getElementById('advice');
const statusBadge = document.getElementById('statusBadge');
const historyEl = document.getElementById('history');

// ---------- Authentication UI ----------
const btnSignUp = document.getElementById('btnSignUp');
const btnSignIn = document.getElementById('btnSignIn');
const btnSignOut = document.getElementById('btnSignOut');

btnSignUp.addEventListener('click', () => {
    const email = prompt('Email'); const pass = prompt('Password');
    if (!email || !pass) return;
    auth.createUserWithEmailAndPassword(email, pass).then(() => alert('Signed up')).catch(e => alert(e.message));
});
btnSignIn.addEventListener('click', () => {
    const email = prompt('Email'); const pass = prompt('Password');
    if (!email || !pass) return;
    auth.signInWithEmailAndPassword(email, pass).then(() => alert('Signed in')).catch(e => alert(e.message));
});
btnSignOut.addEventListener('click', () => auth.signOut());

auth.onAuthStateChanged(user => {
    if (user) { btnSignIn.style.display = 'none'; btnSignUp.style.display = 'none'; btnSignOut.style.display = 'inline-block'; }
    else { btnSignIn.style.display = 'inline-block'; btnSignUp.style.display = 'inline-block'; btnSignOut.style.display = 'none'; }
});

// ---------- Save profile ----------
document.getElementById('userProfileForm').addEventListener('submit', e => {
    e.preventDefault();
    const profile = collectProfileFromForm();
    localStorage.setItem('nutriUser', JSON.stringify(profile));
    saveMsg.style.display = 'block'; setTimeout(() => saveMsg.style.display = 'none', 1800);
});

document.getElementById('btnSaveCloud').addEventListener('click', async () => {
    const user = auth.currentUser;
    if (!user) return alert('Sign in to save profile to cloud');
    const profile = collectProfileFromForm();
    await db.collection('users').doc(user.uid).set(profile, { merge: true });
    alert('Saved to cloud');
});

function collectProfileFromForm() {
    return {
        name: document.getElementById('name').value || '',
        age: Number(document.getElementById('age').value) || 0,
        gender: document.getElementById('gender').value || '',
        height: Number(document.getElementById('height').value) || 0,
        weight: Number(document.getElementById('weight').value) || 0,
        activity: document.getElementById('activity').value || 'sedentary',
        diet: document.getElementById('diet').value || 'omnivore',
        goal: document.getElementById('goal').value || 'maintenance',
        allergies: document.getElementById('allergies').value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    };
}

// If user logged in, load profile from cloud
auth.onAuthStateChanged(async user => {
    if (user) {
        const doc = await db.collection('users').doc(user.uid).get();
        if (doc.exists) { const data = doc.data(); populateProfileForm(data); localStorage.setItem('nutriUser', JSON.stringify(data)); }
    }
});

function populateProfileForm(profile) { if (!profile) return; for (let k in profile) { const el = document.getElementById(k); if (el) el.value = profile[k]; } document.getElementById('allergies').value = (profile.allergies || []).join(', '); }

// ---------- Profile collapse toggle ----------
const toggleProfileBtn = document.getElementById('toggleProfile');
const profileBody = document.getElementById('profileBody');
toggleProfileBtn.addEventListener('click', () => {
    if (profileBody.classList.contains('collapsed')) {
        profileBody.classList.remove('collapsed');
        toggleProfileBtn.textContent = 'Collapse';
    } else {
        profileBody.classList.add('collapsed');
        toggleProfileBtn.textContent = 'Expand';
    }
});

// ---------- Scanning: ZXing (camera) ----------
// ---------- Camera Scanner (ZXing) ----------
let codeReader = null;

document.getElementById("startCamBtn").addEventListener("click", async () => {
    try {
        if (!codeReader) codeReader = new ZXing.BrowserMultiFormatReader();

        const videoElem = document.getElementById("video");
        videoElem.style.display = "block"; // Show video UI

        const devices = await codeReader.listVideoInputDevices();
        if (!devices.length) {
            alert("No camera found.");
            return;
        }

        const deviceId = devices[0].deviceId;

        codeReader.decodeFromVideoDevice(deviceId, "video", (result, err) => {
            if (result) {
                console.log("Barcode detected:", result.text);
                stopCameraStream();
                handleBarcode(result.text);
            }
        });
    } catch (error) {
        console.error("Camera error:", error);
        alert("Camera could not start: " + error.message);
    }
});

document.getElementById("stopCamBtn").addEventListener("click", () => stopCameraStream());

function stopCameraStream() {
    const videoElem = document.getElementById("video");

    try {
        if (codeReader) {
            codeReader.reset(); // stop ZXing
        }

        if (videoElem.srcObject) {
            const tracks = videoElem.srcObject.getTracks();
            tracks.forEach(t => t.stop());
        }

        videoElem.srcObject = null;
        videoElem.style.display = "none";
    } catch (e) {
        console.error("Error stopping camera:", e);
    }
}




// ---------- Image upload using Quagga
const imageUpload = document.getElementById('imageUpload');
const previewImage = document.getElementById('previewImage');
const uploadScanBtn = document.getElementById('uploadScanBtn');
const tryRotateBtn = document.getElementById('tryRotateBtn');

// 1) Clicking upload button opens the hidden file input
uploadScanBtn.addEventListener('click', () => {
    imageUpload.click();
});

// 2) When user selects a file: preview + auto-scan
imageUpload.addEventListener('change', async () => {
    const f = imageUpload.files[0];
    if (!f) return;

    // show preview
    previewImage.src = URL.createObjectURL(f);
    previewImage.style.display = 'block';

    // small UI feedback (optional)
    resultBox.innerHTML = '<small>Detecting barcode in uploaded image…</small>';

    const url = URL.createObjectURL(f);

    try {
        // Try decode without rotation first
        const code = await tryQuagga(url, 0);
        if (code) {
            handleBarcode(code);
            return;
        }
        // if not found, attempt rotational tries automatically
        const rotatedCode = await tryRotateImage(url);
        if (rotatedCode) {
            handleBarcode(rotatedCode);
            return;
        }

        // nothing found
        resultBox.innerHTML = '<p>❌ Could not detect a barcode in the uploaded image. Try clearer image or camera.</p>';
    } catch (err) {
        console.error(err);
        resultBox.innerHTML = '<p>❌ Error scanning uploaded image.</p>';
    }
});

// 3) tryQuagga: accepts rotation degrees; rotates image if needed, then decodes
function tryQuagga(src, rotateDeg = 0) {
    return new Promise(async (resolve) => {
        let srcToUse = src;
        if (rotateDeg && rotateDeg % 360 !== 0) {
            try {
                srcToUse = await rotateImageDataUrl(src, rotateDeg);
            } catch (e) {
                console.error('rotateImageDataUrl failed', e);
                resolve(null);
                return;
            }
        }

        Quagga.decodeSingle({
            src: srcToUse,
            numOfWorkers: 0,
            inputStream: { size: 800 },
            decoder: { readers: ["ean_reader", "upc_reader", "code_128_reader", "code_39_reader"] }
        }, function (result) {
            if (result && result.codeResult) resolve(result.codeResult.code);
            else resolve(null);
        });
    });
}

// 4) Try rotations helper: tries 90, 180, 270
async function tryRotateImage(url) {
    const angles = [90, 180, 270];
    for (const a of angles) {
        const code = await tryQuagga(url, a);
        if (code) return code;
    }
    return null;
}

// 5) rotateImageDataUrl: rotate an image (data URL or blob URL) and return new dataURL
function rotateImageDataUrl(imageUrl, degrees) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        // Important for cross-origin images (if any)
        img.crossOrigin = 'Anonymous';
        img.onload = function () {
            const w = img.width, h = img.height;
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            if (degrees % 180 !== 0) {
                canvas.width = h;
                canvas.height = w;
            } else {
                canvas.width = w;
                canvas.height = h;
            }

            // move origin to center for rotation
            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.rotate(degrees * Math.PI / 180);
            ctx.drawImage(img, -w / 2, -h / 2);

            // convert to data URL
            const dataUrl = canvas.toDataURL('image/jpeg');
            resolve(dataUrl);
        };
        img.onerror = (e) => reject(e);
        img.src = imageUrl;
    });
}

// 6) "Try rotated" button: run explicit rotate attempts on currently selected file
tryRotateBtn.addEventListener('click', async () => {
    const f = imageUpload.files ? imageUpload.files[0] : null;
    if (!f) return alert('Please upload an image first.');

    resultBox.innerHTML = '<small>Trying rotated variants…</small>';
    const url = URL.createObjectURL(f);
    const code = await tryRotateImage(url);
    if (code) handleBarcode(code);
    else resultBox.innerHTML = '<p>❌ No barcode after rotations.</p>';
});


// ---------- Fetch product from OpenFoodFacts ----------
async function handleBarcode(barcode) {
    addHistory(barcode);
    resultBox.innerHTML = '<small>Fetching product...</small>';
    try {
        const resp = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
        const data = await resp.json();
        if (!data || data.status !== 1) { resultBox.innerHTML = '<p>❌ Product not found.</p>'; clearResult(); return; }
        const p = data.product;
        const product = normalizeOpenFoodProduct(p);
        showProduct(product);
    } catch (e) { console.error(e); resultBox.innerHTML = '<p>❌ Error fetching product.</p>'; }
}

function normalizeOpenFoodProduct(p) {
    const nutr = p.nutriments || {};
    const ingredients_text = (p.ingredients_text || p.ingredients_text_en || '').toLowerCase();
    return {
        code: p.code,
        name: p.product_name || p.generic_name || 'Unknown',
        brand: (p.brands || '').split(',')[0],
        nutriments: {
            calories: Number(nutr['energy-kcal_100g'] || nutr['energy_100g'] || 0),
            sugar: Number(nutr['sugars_100g'] || 0),
            fat: Number(nutr['fat_100g'] || 0),
            satfat: Number(nutr['saturated-fat_100g'] || 0),
            protein: Number(nutr['proteins_100g'] || 0),
            salt: Number(nutr['salt_100g'] || 0)
        },
        ingredients_text
    };
}

// ---------- Ingredient explainers ----------
const INGREDIENT_EXPLAINERS = {
    'high fructose corn syrup': 'A cheap sweetener linked to increased sugar intake — best avoided.',
    'aspartame': 'Artificial sweetener — safe for many but avoid if you prefer clean-label.',
    'hydrogenated': 'Contains trans fats (hydrogenated oils) — linked with heart disease.',
    'sodium nitrate': 'A preservative found in processed meats — linked to certain health risks when consumed in excess.',
    'msg': 'Flavor enhancer (monosodium glutamate) — some people are sensitive.',
    'vanaspati': 'Hydrogenated vegetable oil used in some regions — contains trans fats.'
};

function explainIngredients(text) {
    const found = [];
    for (const key in INGREDIENT_EXPLAINERS) { if (text.includes(key)) { found.push({ k: key, info: INGREDIENT_EXPLAINERS[key] }); } }
    return found;
}

// ---------- Advanced scoring ----------
function analyzeProductAgainstProfile(product, profile) {
    const nutr = product.nutriments;
    let score = 100; const reasons = [];

    // allergy immediate
    for (const a of (profile.allergies || [])) {
        if (product.ingredients_text.includes(a)) return { score: 0, label: '❌ Avoid — Allergen', color: 'bad', advice: `Contains ${a}. Avoid immediately.`, reasons: [`Contains allergen: ${a}`] };
    }

    // diet compatibility
    if (profile.diet === 'vegetarian') {
        const nonVegWords = ['chicken', 'beef', 'pork', 'fish', 'gelatin'];
        for (const w of nonVegWords) if (product.ingredients_text.includes(w)) { score -= 50; reasons.push('Contains non-vegetarian ingredients'); }
    }

    // sugar
    if (nutr.sugar > (profile.goal === 'diabetes' ? 5 : (profile.goal === 'weight_loss' ? 10 : 20))) { score -= 30; reasons.push(`High sugar: ${nutr.sugar} g/100g`); }
    else reasons.push(`Sugar: ${nutr.sugar} g/100g`);

    // saturated fat
    if (nutr.satfat > 4) { score -= 15; reasons.push(`High saturated fat: ${nutr.satfat} g/100g`); }

    // sodium (salt in g -> mg)
    const sodium_mg = nutr.salt * 400;
    if (sodium_mg > (profile.goal === 'diabetes' ? 800 : 1500)) { score -= 15; reasons.push(`High sodium (~${Math.round(sodium_mg)} mg/100g)`); }

    // calories
    if (profile.goal === 'weight_loss' && nutr.calories > 250) { score -= 20; reasons.push('High calories for weight loss'); }
    if (profile.goal === 'muscle_gain' && nutr.protein > 10) { score += 10; reasons.push('Good protein for muscle gain'); }

    // ingredient-based penalties
    const expls = explainIngredients(product.ingredients_text);
    expls.forEach(e => { score -= 12; reasons.push(`Contains ${e.k}`); });

    score = Math.max(0, Math.min(100, score));
    let label = ''; let color = '';
    if (score >= 75) { label = '✅ Recommended'; color = 'good'; }
    else if (score >= 45) { label = '⚠️ Use with caution'; color = 'warn'; }
    else { label = '❌ Avoid'; color = 'bad'; }

    let advice = '';
    if (color === 'good') advice = 'This product fits your profile — occasional or regular use is acceptable.';
    else if (color === 'warn') advice = 'Consider smaller portion sizes or look for lower-sugar/sodium alternatives.';
    else advice = 'Not recommended — choose healthier alternatives.';

    return { score, label, color, advice, reasons, ingredientInsights: expls };
}

function clearResult() { nutriList.style.display = 'none'; reasonList.innerHTML = ''; ingredientExplainer.innerHTML = '—'; adviceBox.innerHTML = '—'; statusBadge.innerHTML = ''; }

// ---------- Show final product ----------
function showProduct(product) {
    const profile = JSON.parse(localStorage.getItem('nutriUser') || 'null');
    if (!profile) { resultBox.innerHTML = '<p>Please fill and save your profile first.</p>'; return; }

    document.getElementById('calVal').innerText = product.nutriments.calories;
    document.getElementById('sugVal').innerText = product.nutriments.sugar;
    document.getElementById('fatVal').innerText = product.nutriments.fat;
    document.getElementById('protVal').innerText = product.nutriments.protein;
    nutriList.style.display = 'flex';

    resultBox.innerHTML = `<strong>${product.name}</strong><br><small>${product.brand || ''} • code ${product.code}</small>`;

    const analysis = analyzeProductAgainstProfile(product, profile);

    // badge
    statusBadge.innerHTML = `<span class='badge ${analysis.color}'>${analysis.label}</span>`;

    // reasons
    reasonList.innerHTML = '<ul>' + analysis.reasons.map(r => `<li>${r}</li>`).join('') + '</ul>';

    // ingredient explainers
    if (analysis.ingredientInsights.length) { ingredientExplainer.innerHTML = analysis.ingredientInsights.map(i => `<b>${i.k}</b>: ${i.info}`).join('<hr>'); } else ingredientExplainer.innerHTML = 'No flagged additives detected.';

    adviceBox.innerHTML = `<strong>${analysis.advice}</strong>`;
}

// ---------- History ----------
function addHistory(code) { const h = JSON.parse(localStorage.getItem('nutriHistory') || '[]'); h.unshift({ code, ts: Date.now() }); localStorage.setItem('nutriHistory', JSON.stringify(h.slice(0, 20))); renderHistory(); }
function renderHistory() { const h = JSON.parse(localStorage.getItem('nutriHistory') || '[]'); if (!h.length) { historyEl.innerHTML = 'No scans yet.'; return; } historyEl.innerHTML = h.map(item => `<div style='padding:6px 0;border-bottom:1px dashed #eee'><small>${new Date(item.ts).toLocaleString()}</small><br><b>${item.code}</b></div>`).join(''); }
renderHistory();
