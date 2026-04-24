// -------------------------------------------------------------
//  FOOD IMAGE SCANNER MODULE — NutriScan
//  Uses: TensorFlow.js MobileNet + OpenFoodFacts + Profile Analysis
// -------------------------------------------------------------

// -------------------------------------------------------------
// MODEL LOADING — MobileNet
// -------------------------------------------------------------
let mobilenetModel = null;
const modelStatusEl = document.getElementById("modelStatus");

async function loadModel() {
    try {
        modelStatusEl.innerText = "Loading model…";
        mobilenetModel = await mobilenet.load({ version: 2, alpha: 1.0 });
        modelStatusEl.innerText = "Model Loaded (MobileNet)";
    } catch (err) {
        console.error("Model load failed", err);
        modelStatusEl.innerText = "Model Failed!";
    }
}
loadModel();

// -------------------------------------------------------------
// UI REFERENCES
// -------------------------------------------------------------
const foodVideo = document.getElementById("foodVideo");
const startFoodCam = document.getElementById("startFoodCam");
const stopFoodCam = document.getElementById("stopFoodCam");
const takeFoodPhoto = document.getElementById("takeFoodPhoto");

const foodUploadBtn = document.getElementById("foodUploadBtn");
const foodImageUpload = document.getElementById("foodImageUpload");
const foodPreview = document.getElementById("foodPreview");

const foodProductInfo = document.getElementById("foodProductInfo");
const foodNutriList = document.getElementById("foodNutriList");
const foodCalVal = document.getElementById("foodCalVal");
const foodSugVal = document.getElementById("foodSugVal");
const foodFatVal = document.getElementById("foodFatVal");
const foodProtVal = document.getElementById("foodProtVal");

const foodBadge = document.getElementById("foodBadge");
const foodReasonList = document.getElementById("foodReasonList");
const foodIngredientExplainer = document.getElementById("foodIngredientExplainer");
const foodAdvice = document.getElementById("foodAdvice");
const foodHistoryEl = document.getElementById("foodHistory");

let foodStream = null;

function setFoodStatus(msg) {
    document.getElementById("foodHelp").innerHTML = msg;
}

// -------------------------------------------------------------
// BASE NUTRITION LOOKUP (when OFF product not found)
// -------------------------------------------------------------
const NUTRITION_LOOKUP = {
    pizza: { calories: 266, sugar: 3.7, fat: 10.0, protein: 11 },
    hamburger: { calories: 295, sugar: 5, fat: 14, protein: 17 },
    hotdog: { calories: 290, sugar: 3, fat: 15, protein: 11 },
    french_fries: { calories: 312, sugar: 0.3, fat: 15, protein: 3.4 },
    salad: { calories: 33, sugar: 2.5, fat: 0.4, protein: 1.2 },
    ice_cream: { calories: 207, sugar: 21, fat: 11, protein: 3.5 },
    cake: { calories: 371, sugar: 28, fat: 15, protein: 4 },
    doughnut: { calories: 452, sugar: 30, fat: 25, protein: 4 },
    sandwich: { calories: 250, sugar: 3.5, fat: 10, protein: 12 },
    spaghetti: { calories: 158, sugar: 2.7, fat: 1.2, protein: 5.8 }
};

// -------------------------------------------------------------
// LABEL → FOOD KEY MAPPER
// -------------------------------------------------------------
function mapLabelToFoodKey(label) {
    const l = label.toLowerCase();
    if (l.includes("pizza")) return "pizza";
    if (l.includes("hotdog") || l.includes("frankfurter")) return "hotdog";
    if (l.includes("burger")) return "hamburger";
    if (l.includes("french") && l.includes("fries")) return "french_fries";
    if (l.includes("salad")) return "salad";
    if (l.includes("ice cream") || l.includes("ice-cream")) return "ice_cream";
    if (l.includes("cake")) return "cake";
    if (l.includes("donut") || l.includes("doughnut")) return "doughnut";
    if (l.includes("sandwich")) return "sandwich";
    if (l.includes("spaghetti") || l.includes("pasta")) return "spaghetti";
    return null;
}

// -------------------------------------------------------------
// INGREDIENT HINTS (fallback)
// -------------------------------------------------------------
const INGREDIENT_HINTS = {
    pizza: ["wheat flour", "tomato sauce", "cheese", "oil"],
    hamburger: ["bun", "beef patty", "cheese", "lettuce"],
    hotdog: ["bread roll", "processed meat", "mustard"],
    french_fries: ["potatoes", "oil", "salt"],
    salad: ["lettuce", "vegetables", "olive oil"],
    ice_cream: ["milk", "cream", "sugar"],
    cake: ["flour", "sugar", "eggs", "butter"]
};

function showIngredientHintsForLabel(label) {
    const k = mapLabelToFoodKey(label);
    const hints = INGREDIENT_HINTS[k];
    if (hints) {
        foodIngredientExplainer.innerHTML = `<b>Likely Ingredients:</b><br>${hints.join(", ")}`;
    } else {
        foodIngredientExplainer.innerHTML = "No ingredient hints available.";
    }
}

// -------------------------------------------------------------
// MULTI-CROP GENERATOR (improves accuracy)
// -------------------------------------------------------------
function createCropsFromImageElement(imgEl) {
    const crops = [];
    const w = imgEl.width || 600;
    const h = imgEl.height || 400;

    const positions = [
        [0.5, 0.5],
        [0.25, 0.25],
        [0.75, 0.25],
        [0.25, 0.75],
        [0.75, 0.75]
    ];

    for (const [cx, cy] of positions) {
        const canvas = document.createElement("canvas");
        const size = Math.floor(Math.min(w, h) * 0.6);

        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");

        ctx.drawImage(
            imgEl,
            cx * w - size / 2,
            cy * h - size / 2,
            size,
            size,
            0, 0, size, size
        );

        crops.push(canvas);
    }
    return crops;
}

// -------------------------------------------------------------
// SEARCH PRODUCT BY NAME (OpenFoodFacts)
// -------------------------------------------------------------
async function searchProductByName(name) {
    try {
        const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(
            name
        )}&search_simple=1&json=1&page_size=5&action=process`;

        const res = await fetch(url);
        const data = await res.json();

        if (data.products?.length) {
            return data.products[0].code;
        }
        return null;
    } catch (e) {
        console.error("Name search failed", e);
        return null;
    }
}

// -------------------------------------------------------------
// FETCH PRODUCT DETAILS BY BARCODE (if matched by name)
// -------------------------------------------------------------
async function fetchProductAndShow(code) {
    try {
        const res = await fetch(
            `https://world.openfoodfacts.org/api/v0/product/${code}.json`
        );
        const data = await res.json();

        if (data.status !== 1) {
            setFoodStatus("OFF item not found.");
            return;
        }

        const p = data.product;

        const product = {
            name: p.product_name || "Unknown Item",
            nutriments: {
                calories: Number(p.nutriments["energy-kcal_100g"] || 0),
                sugar: Number(p.nutriments["sugars_100g"] || 0),
                fat: Number(p.nutriments["fat_100g"] || 0),
                protein: Number(p.nutriments["proteins_100g"] || 0),
            },
            ingredients_text: p.ingredients_text || ""
        };

        showFoodResult(product, product.name, 0.9);
    } catch (err) {
        console.error(err);
        setFoodStatus("OFF fetch error");
    }
}

// -------------------------------------------------------------
// FALLBACK NUTRITION → IF OFF FAILS
// -------------------------------------------------------------
function estimateNutritionFromLabel(label, conf) {
    const key = mapLabelToFoodKey(label);
    const nutr = NUTRITION_LOOKUP[key] || { calories: 230, sugar: 5, fat: 12, protein: 7 };

    const product = {
        name: label,
        nutriments: nutr,
        ingredients_text: ""
    };

    showIngredientHintsForLabel(label);
    showFoodResult(product, label, conf);
}

// -------------------------------------------------------------
// SHOW FINAL RESULT (nutrition + recommendation)
// -------------------------------------------------------------
function showFoodResult(product, label, confidence) {

    foodProductInfo.innerHTML = `
        <strong>${product.name}</strong><br>
        <small>Detected: ${label} (${(confidence * 100).toFixed(0)}%)</small>
    `;

    foodCalVal.innerText = product.nutriments.calories;
    foodSugVal.innerText = product.nutriments.sugar;
    foodFatVal.innerText = product.nutriments.fat;
    foodProtVal.innerText = product.nutriments.protein;

    foodNutriList.style.display = "flex";

    const profile = JSON.parse(localStorage.getItem("nutriUser") || "{}");

    if (typeof analyzeProductAgainstProfile === "function") {
        const p = {
            code: "food-" + Date.now(),
            name: product.name,
            brand: "Image",
            nutriments: product.nutriments,
            ingredients_text: product.ingredients_text
        };

        const analysis = analyzeProductAgainstProfile(
            p,
            profile || { allergies: [], diet: "omnivore", goal: "maintenance" }
        );

        foodBadge.innerHTML = `<span class="badge ${analysis.color}">${analysis.label}</span>`;
        foodReasonList.innerHTML =
            "<ul>" + analysis.reasons.map(r => `<li>${r}</li>`).join("") + "</ul>";
        foodIngredientExplainer.innerHTML =
            analysis.ingredientInsights.length
                ? analysis.ingredientInsights
                      .map(i => `<b>${i.k}</b>: ${i.info}`)
                      .join("<hr>")
                : "No flagged ingredients detected.";
        foodAdvice.innerHTML = `<strong>${analysis.advice}</strong>`;
    } else {
        foodBadge.innerHTML = "";
        foodReasonList.innerHTML = "";
    }

    addFoodHistory(product.name);
}

// -------------------------------------------------------------
// HISTORY
// -------------------------------------------------------------
function addFoodHistory(name) {
    const h = JSON.parse(localStorage.getItem("foodHistory") || "[]");
    h.unshift({ name, ts: Date.now() });
    localStorage.setItem("foodHistory", JSON.stringify(h.slice(0, 20)));
    renderFoodHistory();
}

function renderFoodHistory() {
    const h = JSON.parse(localStorage.getItem("foodHistory") || "[]");

    if (!h.length) {
        foodHistoryEl.innerHTML = "No classifications yet.";
        return;
    }

    foodHistoryEl.innerHTML = h
        .map(
            it => `<div style="padding:6px 0;border-bottom:1px dashed #eee">
                <small>${new Date(it.ts).toLocaleString()}</small><br>
                <b>${it.name}</b></div>`
        )
        .join("");
}
renderFoodHistory();

// -------------------------------------------------------------
// CAMERA CAPTURE
// -------------------------------------------------------------
startFoodCam.addEventListener("click", async () => {
    try {
        foodStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment" }
        });
        foodVideo.srcObject = foodStream;
        foodVideo.style.display = "block";
        setFoodStatus("Camera active — point at food.");
    } catch (err) {
        alert("Camera error: " + err);
    }
});

stopFoodCam.addEventListener("click", () => {
    if (foodStream) {
        foodStream.getTracks().forEach(t => t.stop());
        foodStream = null;
    }
    foodVideo.style.display = "none";
    setFoodStatus("Camera stopped.");
});

takeFoodPhoto.addEventListener("click", () => {
    if (!mobilenetModel) return alert("Model loading… wait");
    if (!foodVideo.srcObject) return alert("Start camera first");

    const canvas = document.createElement("canvas");
    canvas.width = foodVideo.videoWidth;
    canvas.height = foodVideo.videoHeight;

    canvas.getContext("2d").drawImage(foodVideo, 0, 0);
    foodPreview.src = canvas.toDataURL("image/jpeg");
    foodPreview.style.display = "block";

    classifyImageElement(canvas);
});

// -------------------------------------------------------------
// UPLOAD IMAGE
// -------------------------------------------------------------
foodUploadBtn.addEventListener("click", () => foodImageUpload.click());

foodImageUpload.addEventListener("change", () => {
    const f = foodImageUpload.files[0];
    if (!f) return;

    const url = URL.createObjectURL(f);
    foodPreview.src = url;
    foodPreview.style.display = "block";

    const img = new Image();
    img.onload = () => classifyImageElement(img);
    img.src = url;
});

// -------------------------------------------------------------
// MAIN CLASSIFIER — MULTI CROP + OFF SEARCH + ESTIMATE
// -------------------------------------------------------------
async function classifyImageElement(imgEl) {
    try {
        if (!mobilenetModel) {
            setFoodStatus("Model not loaded yet.");
            return;
        }

        setFoodStatus("Recognizing food…");

        const crops = createCropsFromImageElement(imgEl);
        const allPreds = [];

        for (const crop of crops) {
            const preds = await mobilenetModel.classify(crop, 3);
            preds.forEach(p => allPreds.push(p));
        }

        // aggregate
        const agg = {};
        allPreds.forEach(p => {
            const label = p.className.toLowerCase();
            const prob = p.probability;
            if (!agg[label]) agg[label] = 0;
            agg[label] += prob;
        });

        const sorted = Object.keys(agg)
            .map(k => ({ label: k, score: agg[k] }))
            .sort((a, b) => b.score - a.score);

        if (!sorted.length) {
            setFoodStatus("Could not detect food.");
            return;
        }

        const top = sorted[0];
        const confidence = Math.min(1, top.score / crops.length);

        setFoodStatus(
            `Top guess: <b>${top.label}</b> (${(confidence * 100).toFixed(0)}%)`
        );

        // Try OFF
        const barcode = await searchProductByName(top.label);
        if (barcode) {
            setFoodStatus("Found match on OpenFoodFacts — loading nutrition…");
            return fetchProductAndShow(barcode);
        }

        // fallback estimate
        estimateNutritionFromLabel(top.label, confidence);
    } catch (err) {
        console.error(err);
        setFoodStatus("Error: " + err.message);
    }
}
