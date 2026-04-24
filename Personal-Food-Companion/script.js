// ---------------- Firebase Setup ----------------
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    GoogleAuthProvider,
    signInWithPopup,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

// Your Firebase config
const firebaseConfig = {
    apiKey: "AIzaSyBz0OAElYhb90qc2QJLuTsRPVtbK68IujM",
    authDomain: "nutriscan-cc2af.firebaseapp.com",
    projectId: "nutriscan-cc2af",
    storageBucket: "nutriscan-cc2af.firebasestorage.app",
    messagingSenderId: "575933823311",
    appId: "1:575933823311:web:4004a57591a6723bd96d3a",
    measurementId: "G-RD062PLLTQ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// ---------------- Mobile Menu Toggle ----------------
document.querySelector('.menu-toggle').addEventListener('click', function () {
    document.querySelector('nav ul').classList.toggle('show');
});

// ---------------- Smooth Scrolling ----------------
document.querySelectorAll('nav a, .hero-buttons a, .pricing-card a').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const targetId = this.getAttribute('href');
        const targetSection = document.querySelector(targetId);

        if (targetSection) {
            window.scrollTo({
                top: targetSection.offsetTop - 70,
                behavior: 'smooth'
            });

            if (window.innerWidth <= 768) {
                document.querySelector('nav ul').classList.remove('show');
            }
        }
    });
});

// ---------------- Modal Handling ----------------
const loginModal = document.getElementById("loginModal");
const signupModal = document.getElementById("signupModal");
const authButton = document.getElementById("authButton");
const closeLogin = document.getElementById("closeLogin");
const closeSignup = document.getElementById("closeSignup");
const openSignup = document.getElementById("openSignup");
const openLogin = document.getElementById("openLogin");

authButton.onclick = function (e) {
    e.preventDefault();
    loginModal.style.display = "flex";
};

openSignup.onclick = function (e) {
    e.preventDefault();
    loginModal.style.display = "none";
    signupModal.style.display = "flex";
};

openLogin.onclick = function (e) {
    e.preventDefault();
    signupModal.style.display = "none";
    loginModal.style.display = "flex";
};

closeLogin.onclick = () => (loginModal.style.display = "none");
closeSignup.onclick = () => (signupModal.style.display = "none");

window.onclick = (e) => {
    if (e.target === loginModal) loginModal.style.display = "none";
    if (e.target === signupModal) signupModal.style.display = "none";
};

// ---------------- Firebase Authentication ----------------

// Google Auth
async function googleAuth() {
    try {
        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        alert(`Logged in as ${user.displayName || user.email}`);
        loginModal.style.display = "none";
    } catch (error) {
        alert(error.message);
    }
}

// Email/Password Signup
document.getElementById("signupForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = e.target.querySelector('input[type="email"]').value;
    const password = e.target.querySelector('input[type="password"]').value;

    try {
        await createUserWithEmailAndPassword(auth, email, password);
        alert("Signup successful!");
        signupModal.style.display = "none";
    } catch (error) {
        alert(error.message);
    }
});

// Email/Password Login
document.getElementById("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = e.target.querySelector('input[type="email"]').value;
    const password = e.target.querySelector('input[type="password"]').value;

    try {
        await signInWithEmailAndPassword(auth, email, password);
        alert("Login successful!");
        loginModal.style.display = "none";
    } catch (error) {
        alert(error.message);
    }
});

// Auth State Monitoring
onAuthStateChanged(auth, (user) => {
    const authButton = document.getElementById("authButton");
    if (user) {
        authButton.innerHTML = `<span>👤 ${user.displayName || user.email}</span>`;
        authButton.onclick = async () => {
            await signOut(auth);
            alert("Logged out successfully!");
            authButton.textContent = "Login / Signup";
        };
    } else {
        authButton.textContent = "Login / Signup";
        authButton.onclick = (e) => {
            e.preventDefault();
            loginModal.style.display = "flex";
        };
    }
});

// ---------------- Contact Form ----------------
document.getElementById('contactForm').addEventListener('submit', function (e) {
    e.preventDefault();
    alert('Thank you for your message! We will get back to you soon.');
    this.reset();
});

// ---------------- Demo Food Scanner ----------------
const uploadBtn = document.getElementById('upload-btn');
const demoBtn = document.getElementById('demo-btn');
const imageUpload = document.getElementById('image-upload');
const scannerImage = document.getElementById('scanner-image');
const scannerPlaceholder = document.getElementById('scanner-placeholder');
const scannerResults = document.getElementById('scanner-results');

const foodDatabase = {
    'apple': { calories: 95, protein: '0.5g', carbs: '25g', fat: '0.3g' },
    'banana': { calories: 105, protein: '1.3g', carbs: '27g', fat: '0.4g' },
    'pizza': { calories: 285, protein: '12g', carbs: '36g', fat: '10g' },
    'salad': { calories: 150, protein: '5g', carbs: '10g', fat: '10g' },
    'burger': { calories: 354, protein: '17g', carbs: '29g', fat: '19g' }
};

uploadBtn.addEventListener('click', () => imageUpload.click());

imageUpload.addEventListener('change', function (e) {
    if (e.target.files && e.target.files[0]) {
        const reader = new FileReader();
        reader.onload = function (e) {
            scannerImage.src = e.target.result;
            scannerImage.style.display = 'block';
            scannerPlaceholder.style.display = 'none';
            setTimeout(() => analyzeFood('custom'), 1500);
        };
        reader.readAsDataURL(e.target.files[0]);
    }
});

demoBtn.addEventListener('click', () => {
    const demoFoods = ['apple', 'banana', 'pizza', 'salad', 'burger'];
    const randomFood = demoFoods[Math.floor(Math.random() * demoFoods.length)];
    scannerImage.src = `https://source.unsplash.com/400x300/?${randomFood}`;
    scannerImage.style.display = 'block';
    scannerPlaceholder.style.display = 'none';
    setTimeout(() => analyzeFood(randomFood), 1500);
});

function analyzeFood(foodType) {
    const foodName = document.getElementById('food-name');
    const calories = document.getElementById('calories');
    const protein = document.getElementById('protein');
    const carbs = document.getElementById('carbs');
    const fat = document.getElementById('fat');

    if (foodType === 'custom') {
        foodName.textContent = 'Food: Custom Dish';
        calories.textContent = Math.floor(Math.random() * 500) + 50;
        protein.textContent = (Math.random() * 30).toFixed(1) + 'g';
        carbs.textContent = (Math.random() * 60).toFixed(0) + 'g';
        fat.textContent = (Math.random() * 30).toFixed(1) + 'g';
    } else {
        const foodData = foodDatabase[foodType];
        foodName.textContent = `Food: ${foodType.charAt(0).toUpperCase() + foodType.slice(1)}`;
        calories.textContent = foodData.calories;
        protein.textContent = foodData.protein;
        carbs.textContent = foodData.carbs;
        fat.textContent = foodData.fat;
    }

    scannerResults.style.display = 'block';
}

// ---------------- FAQ Accordion ----------------
document.querySelectorAll('.faq-item').forEach(item => {
    const question = item.querySelector('.faq-question');
    question.addEventListener('click', () => {
        document.querySelectorAll('.faq-item').forEach(otherItem => {
            if (otherItem !== item) otherItem.classList.remove('active');
        });
        item.classList.toggle('active');
    });
});

// ---------------- Testimonials Auto-scroll ----------------
let testimonialScroll = document.querySelector('.testimonials-container');
let scrollAmount = 0;
function autoScrollTestimonials() {
    if (testimonialScroll) {
        scrollAmount += 1;
        if (scrollAmount >= testimonialScroll.scrollWidth / 2) scrollAmount = 0;
        testimonialScroll.scrollLeft = scrollAmount;
    }
}
setInterval(autoScrollTestimonials, 30);
