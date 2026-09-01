/*
FISH FISH FISH MAIN.JS

Started 28/08/2026

This started life as a Cookie Clicker Mod and turns out I just wanted to make a whole new game. 
Many thanks to Orteil for the inspiration, check it out at: https://orteil.dashnet.org/cookieclicker/
*/
function getEle(what) {
	return document.getElementById(what);
}

function choose(arr) {
	return arr[Math.floor(Math.random() * arr.length)];
}
const rgbToRgba = function(rgb, alpha){return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`}
function hexToRgb(hex) {
	const n = parseInt(hex.slice(1), 16);
	return {
		r: (n >> 16) & 255,
		g: (n >> 8) & 255,
		b: n & 255
	};
}
function rgbToObj(rgb) {
	const [r, g, b] = rgb.match(/\d+/g).map(Number);
	return { r, g, b };
}
function rgbToHex(r, g, b) {
	return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}
function colorToRgb(color) {
	if (color.startsWith('#')) {
		return hexToRgb(color);
	}
	const match = color.match(
		/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/
	);
	if (match) {
		return {
			r: Number(match[1]),
			g: Number(match[2]),
			b: Number(match[3])
		};
	
	throw new Error(`Invalid color: ${color}`);
    }
}

function lerpColor(colorA, colorB, t) {
	t = Math.max(0, Math.min(1, t));

	const a = colorToRgb(colorA);
	const b = colorToRgb(colorB);

	const r = Math.round(a.r + (b.r - a.r) * t);
	const g = Math.round(a.g + (b.g - a.g) * t);
	const bl = Math.round(a.b + (b.b - a.b) * t);

	return `rgb(${r},${g},${bl})`;
}

function updateTextColor(element, dayColor, nightColor) {
	if (element === undefined) {
		//console.log(`Panic`);
		return
	}
	element.style.color = Game.dayNight.isDay ? dayColor : nightColor;
}

function addMinutes(date, minutes) {
	return new Date(date + (minutes * 60 * 1000));
}

function drawFromSheetRect(ctx, sheet, col, row, tileW, tileH, dx, dy, scale = 1, flipX = false) {
	const sx = col * tileW,
		sy = row * tileH;
	const dw = tileW * scale,
		dh = tileH * scale;

	ctx.save();
	if (flipX) {
		ctx.translate(dx + dw / 2, dy + dh / 2);
		ctx.scale(-1, 1);
		ctx.drawImage(sheet, sx, sy, tileW, tileH, -dw / 2, -dh / 2, dw, dh);
	} else {
		ctx.drawImage(sheet, sx, sy, tileW, tileH, dx, dy, dw, dh);
	}
	ctx.restore();
}

function drawFromSheet(ctx, sheet, col, row, tileSize, dx, dy, scale = 1, flipX = false) {
	const sx = col * tileSize;
	const sy = row * tileSize;
	const dw = tileSize * scale;
	const dh = tileSize * scale;

	ctx.save();

	if (flipX) {
		ctx.translate(dx + dw / 2, dy + dh / 2);
		ctx.scale(-1, 1);

		ctx.drawImage(
			sheet,
			sx, sy,
			tileSize, tileSize,
			-dw / 2, -dh / 2,
			dw, dh
		);
	} else {
		ctx.drawImage(
			sheet,
			sx, sy,
			tileSize, tileSize,
			dx, dy,
			dw, dh
		);
	}

	ctx.restore();
}




////// GAME ////// 
const Game = {
	canvas: null,
	ctx: null,

	waterLine: 0,
	centerX: 0,

	displayText: null,
	fishPerSecDisplay: null,
	buildings: [],
	currentFish: 0,
	fishAllTime: 0,
	fishPerClick: 1, // fallback default; real value is computed by recalcStats() once things boot

	// STATS / MODIFIERS
	// "Base" numbers live here. Upgrades (and anything else, later) contribute bonuses on top
	// via statModifiers instead of mutating fishPerClick/fishPerSecMult directly, so effects
	// stack cleanly no matter what order things get purchased/loaded in.
	baseStats: {
		fishPerClick: 1,
		fishPerSecMult: 1
	},
	statModifiers: [], // { source, stat, amount, fromUpgrade }

	// PAUSE STATE
	paused: false,

	// SAVE STATE
	SAVE_KEY: "floFishSave",
	lastSaveTime: 0, // timestamp of the last time we captured state (drives offline-progress math)
	maxOfflineSeconds: 8 * 60 * 60, // cap offline gains at 8 hours so nobody comes back to a broken economy
	offlineEfficiency: 1.0, // dial this down (e.g. 0.5) if full-rate offline gains feel too generous
	saveToastEl: null,
	saveToastTimeout: null,

	// RESIZE, HOOK, 
	resize: function() {
		if (!Game.canvas) return;

		Game.canvas.width = window.innerWidth*1.01;
		Game.canvas.height = window.innerHeight*1.01;

		Game.waterLine = Game.canvas.height * 0.4;
		Game.centerX = Game.canvas.width / 2;
		if (!Game.ascension.canvas) return;
		Game.ascension.canvas.width = Game.canvas.width;
		Game.ascension.canvas.height = Game.canvas.height;
	},

	hook: function() {
		Game.canvas = getEle("gameCanvas");
		Game.ctx = Game.canvas.getContext("2d");
		Game.displayText = getEle("fishDisplay");
		Game.fishPerSecDisplay = getEle("fishPerSec");

		this.hookMenu();
		this.hookPopups();
		this.ascension.hook();

		Game.canvas.addEventListener("pointerdown", Game.handleClick);
		Game.canvas.addEventListener("pointermove", Game.handleHover);
	},
	hookPopups: function() {
		const closeBtn = getEle("offlinePopupClose");
		if (closeBtn) {
			closeBtn.addEventListener("click", () => getEle("offlinePopup")?.classList.remove("open"));
		}
	},

	// BOOT 
	boot: function() {
		Game.hook();
		Game.resize();
		Game.load(); // restore save + apply offline progress BEFORE the first frame renders

		window.addEventListener("resize", Game.resize);
		document.addEventListener("visibilitychange", Game.handleVisibilityChange);
		window.addEventListener("beforeunload", () => Game.save(
			false)); // no point flashing a toast on the way out

		Game.bootSprites();
		Game.setupParticlePool();
        Game.initialFish();
        Game.cloudManager.initialClouds();
		requestAnimationFrame(Game.loop);
		setInterval(Game.tick, 1000);
		setInterval(Game.save, 30000); // autosave safety net every 30s
	},

	// PAUSE / VISIBILITY
	handleVisibilityChange: function() {
		Game.setPaused(document.hidden);
	},
	setPaused: function(isPaused) {
		if (Game.paused === isPaused) return;
		Game.paused = isPaused;

		if (isPaused) {
			Game.save(); // snapshot state + lastSaveTime the moment we go away
		} else { // this could do with "coalescing" and autoapplying rather than bringing up the popup i think
			Game.lastTime = null; // forces loop()'s existing "first frame" guard, so we don't get a huge dt
			const elapsed = (Date.now() - Game.lastSaveTime) / 1000;
			Game.applyOfflineProgress(elapsed);
		}
	},
	togglePause: function() {
		Game.setPaused(!Game.paused);
	},

	// MAIN LOOP
	lastTime: null,
	time: 0,
	loop: function(timestamp) {

		if (Game.paused) {
			Game.lastTime = null; // keep this null the whole time we're paused so resume never spikes dt
			requestAnimationFrame(Game.loop);
			return;
		}

		if (!Game.lastTime) {
			Game.lastTime = timestamp;
			requestAnimationFrame(Game.loop); // try again
			return;
		}

		var dt = (timestamp - Game.lastTime) / 1000;
		dt = Math.min(dt, 1 / 15);
		Game.lastTime = timestamp;

		Game.update(dt);
		Game.draw(dt);
		// Gains

		if (Game.fishDirty) Game.recalcGains();
		Game.doPassive(dt);

		requestAnimationFrame(Game.loop);

	},

	// DRAWING
	draw: function(dt) {
		if (Game.ascension.state !== "idle") {
			Game.ascension.draw(dt);
		}
		if (Game.ascension.state === "sunk") {
			Game.drawBoat(dt); // for the player
			return;
		}
		Game.ctx.clearRect(0, 0, Game.canvas.width, Game.canvas.height);
		Game.drawBG();
		Game.drawSkyBody();
		Game.cloudManager.draw(Game.ctx);
		Game.drawWater(dt, 3.0, 0.1,false);
		Game.drawParticles();
		

		Game.drawBoat(dt); // Draw boat behind both waves
		Game.drawWater(dt, 2.0, 0.3,false);
		
		Game.drawFish();
		Game.drawWater(dt, 1.0, 0.5,false);
		return;
	},
	update: function(dt) {
		Game.time += dt;
		this.updateParticles(dt);
		this.updateFish(dt);
		if (Game.fishDirty) Game.recalcGains();
		if (Game.ascension.state !== "idle") {
		Game.ascension.update(dt);
		return;
		}
		
		this.updateBoat(dt);
		this.updateWeatherBlend(dt);
		this.updateDayNight(dt);
		this.updateSpecialWeather(dt);
		this.updateSkyBody();
		this.cloudManager.update(dt);
		},

	tick: function() {
		if (Game.paused || Game.isAscending) return;
		Game.checkFishSpawn();
		Game.updateShopAffordability();
		Game.doRandomFishJump();
		Game.checkUpdateWeather();
		Game.checkOceanEvent();
		Game.specialWeatherChanceRoll();
        Game.updateDocumentTitle();
        Game.checkAchievements();
	},
    updateDocumentTitle: function() {
        const fishCount = Game.currentFish;
		//console.log(Math.floor(fishCount));
		if (Math.floor(fishCount) === NaN) {
			document.title = "Fish Fish Fish!";
			return;
		}
		if (this.ascension.state !== "idle") {
			document.title = "You Drowned! - Fish Fish Fish";
			return;
		}
        document.title = `${Math.floor(fishCount)} Fish - Fish Fish Fish`;
    },
	gainFish: function(amount) {
		Game.currentFish += amount;
		Game.fishAllTime += amount;
		Game.updateFishDisplay()
	},
    Has: function(upgradeId){
        return Game.upgradesById[upgradeId]?.purchased;
    },
	jumpingFish: 1,
	fishChance: 0.1,
	doRandomFishJump: function() {
		if (Game.fishPerSecond > 0) {
			for (var i = 0; i < Game.jumpingFish; i++) {
				if (Math.random() < Game.fishChance) Game.spawnAFunnyFish();
			}
		}
	},
	spawnAFunnyFish: function(xCoord, yCoord) {
		const poolFish = Game.allFish.filter(fish => fish.unlocked);
		if (poolFish.length > 0) {
			const caught = choose(poolFish);

			xCoord = xCoord || Math.random() * Game.canvas.width;
			yCoord = yCoord || Game.waterLine;

			// 3. Launch the fish particle from the boat position
			const boatSpawnX = this.centerX + (Math.random() * 60 - 30);
			this.spawnParticle(
				xCoord,
				yCoord,
				false, // no text
				false, // no img
				false, // no col
				true, // isFish = true
				caught.column,
				caught.row
			);
		}
	},



	// ASCENSION


	// BUGS BUGS BUGS

	// Panels do not use display: block, therefore doing display: block for showing them does not work.
	// The bottom of the sea doesn't blend into the top of the ascend canvas, there's a hard edge, despite the fact that they are the same color. This is because the ascend canvas is not drawn until after the main canvas is drawn, so it draws over it. The solution is to draw the ascend canvas first, then draw the main canvas over it, and then move the main canvas up and the ascend canvas down to create the effect of ascending.
	// Can canvas gradients do opacity? I think the answer is no, but I should check. If they can, then I can make the water gradient fade to transparent at the bottom, and then the ascend canvas will show through. This will make the transition much smoother.
	// If not... who fuckin knows... 
	
	// Okay. Here's how we're gonna do this
	ascension: {
		state: "idle", // idle -> sinking -> sunk -> rising -> idle
		timer: 0,
		duration: 2500,
		progress: 0, // 0 = surface, 1 = fully sunk
		canvas: null,
		ctx: null,

		hook() {
			if (this.canvas) return;
			this.canvas = getEle('ascendCanvas');
			this.ctx = this.canvas.getContext('2d');
		},

		ascend() {
			if (this.state !== "idle") return;
			this.state = "sinking";
			this.timer = 0;
			Game.hideGameUI();


			getEle('ascendTextSub').textContent = `You earned: ${Math.floor(Game.fishAllTime)} total Fish!`
		},

		reincarnate() {
			if (this.state !== "sunk") return;
			this.state = "rising";
			this.timer = 0;

			// Stuff that needs to happen BEFORE ascending
			Game.hideAscendUI(); // now correctly removes 'visible';
			this.doPopup();
			Game.spawnedFish = [];
			Game.initialFish();
			Game.resetGame(false);
		},

		update(dt) {
			if (this.state === "idle") return;
			if (this.state === "sinking" || this.state === "rising") {
				this.timer += dt * 1000;
			}
			const t = Math.min(this.timer / this.duration, 1);
			
			if (this.state === "sinking") {
				this.progress = t;
				this.updateCanvases();
				if (t >= 1) {
					this.state = "sunk";
					this.timer = 0;
					Game.showAscendUI(); // now correctly adds 'visible'
				}
			}

			if (this.state === "rising") {
				this.progress = 1 - t;
				if (t >= 1) {
					this.state = "idle";
					this.timer = 0;
					Game.showGameUI();
				}
			}
		},
		updateCanvases: function(sinking=true) {
			Game.canvas.top = `${sinking ? "-" : ""}${this.progress}px`;
		},
		draw() {
			const ctx = this.ctx;
			const w = this.canvas.width, h = this.canvas.height;
			const t = this.progress;

			ctx.clearRect(0, 0, w, h);
			if (t <= 0) return;

			const revealHeight = h * t;
			ctx.save();
			//ctx.beginPath();
			//ctx.rect(0, h - revealHeight, w, revealHeight);
			//ctx.clip();

			const colors = Game.getEnvColors(); // reuse so the water color matches seamlessly
			const grad = ctx.createLinearGradient(0, 0, 0, h*t);
			//const top = rgbToObj(colors.waterShallow);
			const col = rgbToObj(lerpColor(colors.waterDeep,"#0c0714", t));

			grad.addColorStop(0, `rgba(${col.r}, ${col.g}, ${col.b}, ${t})`); 


			grad.addColorStop(1, `rgba(${col.r}, ${col.g}, ${col.b}, ${t*1.2})`);
			ctx.fillStyle = grad;
			ctx.fillRect(0, 0, w, h);

			//this.drawTentacle(ctx, w, h, t);
			this.drawSunkPlayer(ctx, w, h, t);
			ctx.restore();
		},

		drawTentacle(ctx, w, h, t) {
			const reach = Math.sin(h) * t;
		},

		drawSunkPlayer(ctx, w, h, t) {
			if (!this.state === "sunk") return;
			const sheet = Game.imgs["flo_chars"];
			if (!sheet.complete) return;
			ctx.save();
			ctx.globalAlpha = this.state === "sunk" ? 1 : 0;
			drawFromSheet(ctx, sheet, 0, 0, 16, w /2, Game.waterLine + h/4, 2, true);
			ctx.restore();
		},
		doPopup(){

			const ele = getEle('popup');
			const text = document.createElement("div");
			text.className = "popupText";
			text.innerHTML = "<h2>ANOTHER DAY BEGINS</h2>"
			ele.appendChild(text);
			setTimeout(() => {
				ele.removeChild(text);	
			}, 1500)
		}
	},
	
	hideAscendUI: function(){
		const ascui = getEle("ascendUI");
		ascui.classList.remove('visible'); 
	},
	showAscendUI: function(){
		const ascui = getEle("ascendUI");
		ascui.classList.add('visible');
	},
	hideGameUI: function(){
		const eles = document.getElementsByClassName('t');
		for (const elem of eles) {
			elem.classList.add('hidden');
			elem.classList.remove('open');
		}
		this.ensurePanelsClosed();
	},
	showGameUI: function(){
		const eles = document.getElementsByClassName('t');
		for (const elem of eles) {
			elem.classList.remove('hidden');
		}
	},
	ensurePanelsClosed: function(){
		for (const id in this.panels) {
			const panel = this.panels[id];
			if (panel.open) {
				console.log("Closing "+ id)
				this.togglePanel(id);
				console.log(panel.open)
			}
		}
		// Also hide Cultist and Bag
		var cultToggle = getEle('cultistToggle');
		cultToggle.style.display = 'none';
	},
	/*
	isAscending: false,
	ascendTimer: 0, // set on ascend, time before stopping main game and resetting
	ascendStarted: false, 
	stopRendering: false, // set once above timer is finished
	ascendCanvas: null,
	descend: false,


	// This is a fucking MESS (the commented code below)
	// Basically the idea is you fall through the boat (+The boat breaks in future, +A tentacle comes and grabs you)
	// Then the bottom canvas moves up as the top canvas does to simulate the falling into the sea
	// Descending I'm thinking we do a uhhh like fade through effect? That could maybe be cool?

	// Maybe a way to do this is EXPANDING the main canvas on the y axis and moving it up at the same time, that way we can keep the gradient, have a tentacle, etc. 
	// Then we simply shift it back to reincarnate? 
	// My attempt at this VVVV 
	ascend: function(){
		console.log("Started Ascension");
		// isAscending = true, ascendTimer = 0, ascensionStarted = true, -> ascendTimer += dt -> 
		this.isAscending = true;
		this.ascendTimer = 0;
		this.ascendStarted = true;
	},
	reincarnate: function(){
		
	},

	growShrinkCanvas: function(){
		var canv = this.canvas;
		canv.style.height = this.ascendTimer;
		canv.style.top = `-${this.ascendTimer}px`;
	},
	updateAscend: function(dt){
		if (!this.ascendStarted) return;
		var val = dt * 1000;
		if (this.descend) this.ascendTimer -= val;
		else this.ascendTimer += val;
		if (this.ascendTimer > 1000) {
			this.ascendStarted = false; // the ascend has "finished" and should proceed to logic / drawing
			return;
		}
		this.growShrinkCanvas();
	},
	drawAscend: function(dt){
		// Takes the WHOLE canvas. 

	},
	/*
	ascend: function(){
		console.log("Ascension started!");
		this.isAscending = true;
		var canvas = this.ascendCanvas
		if (!canvas) {
			canvas = getEle('ascendCanvas');
			this.ascendCanvas = canvas;
		}
		
		canvas.style.bottom = `-${this.canvas.height+2}px`;
		canvas.width = this.canvas.width;
		canvas.height = this.canvas.height;
		//console.log("Finished!")
	},
	isHidden: false,
	// I have an element called AscendUI that I both need to set to display block and then opacity 1 to fade in! 
	fadeElements: function(out=true){
		const elements = document.getElementsByClassName('t');
		for (const element of elements) {
			element.style.opacity = out ? '0' : '1';
		}
		if (out){
		setTimeout(() => {
			this.hideHTML();
		}, 500);}
		
	},
	hideHTML: function(){
		const elements = document.getElementsByClassName('t');
		for (const element of elements) {
			element.style.display = 'none';
			element.classList.remove('open'); // in case you had UI open
		}
		this.isHidden = true;
	},
	showHTML: function(){
		const elements = document.getElementsByClassName('t');
		for (const element of elements) {
			element.style.display = 'block';
		}
		this.isHidden = false;
	},
	updateAscend: function(dt) {
		this.ascendTimer += dt * 1000;
		if (this.ascendTimer > 1000 && !this.ascendStarted) {
			this.ascendStarted = true;

			this.fadeElements(); // Base game UI fades out
			this.showAscendUI(); // Ascension UI fades in
		}

		if (this.ascendTimer > 800) {
			this.stopRendering = true;
		}

		if (this.ascendTimer > 1000) {
			const progress = this.ascendTimer - 1000;

			this.canvas.style.top =
				`-${Math.min(progress, this.canvas.height)}px`;

			this.ascendCanvas.style.bottom =
				`-${Math.max(this.canvas.height - progress, 0)}px`;
		}
	},
	showAscendUI: function() {
		const ui = getEle('ascendUI');

		ui.style.display = 'block';

		// Force display:block to be committed before changing opacity.
		requestAnimationFrame(() => {
			ui.style.opacity = '1';
		});
	},
	reincarnate: function() {
		console.log("Reincarnation started!");
		this.isAscending = false;
		this.stopRendering = false;
		this.ascendStarted = false;
		this.ascendTimer = 0;
		this.resetGame(hardReset=false);
		this.startUnascend();
	},
	startUnascend: function() {
		this.ascendCanvas.style.height = 0;
		this.ascendCanvas.style.bottom = 0;
		Game.canvas.style.top = 0;
		this.showHTML();
		this.fadeElements(out=false);
	},
	drawAscend: function(dt){		
		var canvas = this.ascendCanvas;
		var ctx = canvas.getContext('2d');
		ctx.clearRect(0, 0, canvas.width, canvas.height);

		// draw bg
		var colors = Game.getEnvColors();
		const ascGrad = ctx.createLinearGradient(0, 0, 0, Game.waterLine);
		ascGrad.addColorStop(0, colors.waterDeep);
		ascGrad.addColorStop(0.1, colors.waterShallow);
		ctx.fillStyle = ascGrad;
		ctx.fillRect(0, 0, canvas.width, canvas.height);

		// Flash Some big Text
		ctx.fillStyle = "#ffffff";
		ctx.textAlign = "center";
		ctx.font = "48px Monaco, monospace";
		ctx.fillText("You ascended", canvas.width / 2, canvas.height / 2-100);
		ctx.font = "24px Monaco, monospace";
		ctx.fillText("You sink to the briny depths...", canvas.width / 2, canvas.height / 2 - 60);
	},*/
	/// MAYBE ANOTHER WAY 
	// what about having the second canvas be slightly transparent on the gradient?? Maybe compatibility sucks for that tho.

	// CLICK EVENTS

	boatHitbox: {
		width: 300,
		height: 240
	},
	isBoatClicked: false,
	isPointInBoat: function(x, y) {
		const boatX = Game.centerX;
		const boatY = Game.waterLine - 50;

		const halfWidth = Game.boatHitbox.width / 2;
		const halfHeight = Game.boatHitbox.height / 2;

		return (
			x >= boatX - halfWidth &&
			x <= boatX + halfWidth &&
			y >= boatY - halfHeight &&
			y <= boatY + halfHeight
		);
	},
	handleHover: function(e) {
		const rect = Game.canvas.getBoundingClientRect();

		const x = e.clientX - rect.left;
		const y = e.clientY - rect.top;

		Game.boat.isHovered = Game.isPointInBoat(x, y);

		Game.boat.scale = Game.boat.isHovered ?
			1.03 :
			1;
	},
	handleClick: function(e) {
		if (Game.paused) return;
		if (!Game.boat.isHovered) return;
		Game.boat.scale = 0.88;
		Game.catchFish(e);
		Game.updateShopAffordability();

	},

	// Catching 
	catchFish: function(e) {
		Game.gainFish(Game.fishPerClick);

		// 1. Spawn +1 Text
		const textOffset = [(Math.random() * 10) - 10, Math.random() * 10 - 10];
		this.spawnParticle(
			this.centerX + textOffset[0],
			this.waterLine - 30 + textOffset[1],
			`+${this.fishPerClick}`,
            col="#"
		);
		const boatSpawnX = this.centerX + (Math.random() * 60 - 30);
		Game.spawnAFunnyFish(boatSpawnX);
	},

	// WEATHER
	// Weather types 
	// Clear <--> Cloudy <--> Rainy <--> Stormy 
	// Special Weathers:
	// Solar Eclipse, 
	// Times of Day:
	// Day, Sunset, Night, Sunrise ?? 
	// Sun / Moon for each?
	weather: {
		current: "clear",
		target: null, // weather we're blending toward; null when stable
		blend: 1, // 0 -> 1 progress toward `target`; 1 = fully settled on `current`
	},
	allWeathers: {
		"clear": {
			transitions: {
				"cloudy": 0.2
			},
			colors: {
				skyTop: "#87CEEB",
				skyBottom: "#E0F6FF",
				waterShallow: "#1a4b6e",
				waterDeep: "#0a1b3c"
			}
		},
		"cloudy": {
			transitions: {
				"clear": 0.3,
				"rainy": 0.2
			},
			colors: {
				skyTop: "#a9b6bf",
				skyBottom: "#d8e2e6",
				waterShallow: "#2e5164",
				waterDeep: "#0a1c2e"
			}
		},
		"rainy": {
			transitions: {
				"cloudy": 0.2,
				"stormy": 0.2
			},
			colors: {
				skyTop: "#5c6b73",
				skyBottom: "#8fa3ab",
				waterShallow: "#20404f",
				waterDeep: "#071521"
			}
		},
		"stormy": {
			transitions: {
				"rainy": 0.25
			},
			colors: {
				skyTop: "#33393f",
				skyBottom: "#54606b",
				waterShallow: "#152a34",
				waterDeep: "#040d14"
			}
		}
	},
	weatherNextCheck: null,
	baseWeatherChance: 0.5,
	weatherChance: 0.5,
	WEATHER_INTERVAL_MIN: 0.1, 
	WEATHER_INTERVAL: 0.1, 
	WEATHER_BLEND_SECONDS: 20, 

	// Called from tick() every ~1s.
	checkUpdateWeather: function() {
		const now = Date.now();

		if (!this.weatherNextCheck) {
            console.log("Initial weather");
            var nextWeatherCheck = this.WEATHER_INTERVAL_MIN + Math.random() * this.WEATHER_INTERVAL;
            console.log(`Set for ${nextWeatherCheck} minutes`); 
			this.weatherNextCheck = addMinutes(now, nextWeatherCheck);
			return;
		}
        //console.log(`Weather check initiate, aiming for ${this.weatherNextCheck}`);
		if (now >= this.weatherNextCheck) {
            
			if (!this.weather.target) { // don't stack a fresh roll on top of an in-progress blend
				if (Math.random() < this.weatherChance) {
					console.log("New weather time?");
					var success = this.rollNextWeather();
                    if (success) this.weatherChance = this.baseWeatherChance; // pressure resets once it actually lands
				} else {
					this.weatherChance += 0.1; // more likely next time
				}
			}
            console.log(`Set for ${nextWeatherCheck} minutes`); 
			this.weatherNextCheck = addMinutes(now, this.WEATHER_INTERVAL_MIN + Math.random() * this
				.WEATHER_INTERVAL);
		}
	},

	rollNextWeather: function() {
		const transitions = this.allWeathers[this.weather.current].transitions;

		for (const candidate in transitions) {
			if (Math.random() < transitions[candidate]) {
				this.weather.target = candidate;
				this.weather.blend = 0;
				console.log(`Weather shifting: ${this.weather.current} -> ${candidate}`);
				return true;
			}
		}
	},
	updateWeatherBlend: function(dt) {
		if (!this.weather.target) return;

		this.weather.blend += dt / this.WEATHER_BLEND_SECONDS;

		if (this.weather.blend >= 1) {
			this.weather.current = this.weather.target;
			this.weather.target = null;
			this.weather.blend = 1;
		}
	},
	// SPECIAL WEATHER
	specialWeather: {
		active: null, // id of the running special weather, or null
		elapsed: 0,
		duration: 0,
		blend: 0 // 0->1 fade-in, holds at 1, ->0 fade-out. Sky/water code reads this.
	},

	allSpecialWeathers: {
		solarEclipse: {
			name: "Solar Eclipse",
			chance: 0.002,
			duration: 420,
			fadeSeconds: 4,
			skyColor: "#3a2f4d",
			waterTint: "#ff8c42",
			sunFrame: "eclipse",
			particleType: "fireball",
            requirements: ['cthulhuswrath'],
		},
		cookieStorm: {
			name: "Cookie Storm",
			chance: 0.001,
			duration: 120,
			fadeSeconds: 4,
			skyColor: "#e8c273",
			waterTint: "#c68642",
			sunFrame: "cookie",
			particleType: "cookie",
            requirements: ["thesecretcookie"]
		}
	},

	specialWeatherChanceRoll: function() {
		if (this.specialWeather.active) return; // only one at a time
		for (const id in this.allSpecialWeathers) {
            const def = this.allSpecialWeathers[id];
            if (def.requirements && !def.requirements.every(req => Game.Has(req))) continue; // skip if requirements not met
			if (Math.random() < this.allSpecialWeathers[id].chance) {
				this.startSpecialWeather(id);
				return;
			}
		}
	},

	startSpecialWeather: function(id) {
		const def = this.allSpecialWeathers[id];
		this.specialWeather.active = id;
		this.specialWeather.elapsed = 0;
		this.specialWeather.duration = def.duration;
		this.specialWeather.blend = 0;
		console.log(`Special weather starting: ${def.name}`);
		this.cloudManager.tellCloudsToLeave();
	},

	// Called every frame from update(dt).
	updateSpecialWeather: function(dt) {
		const sw = this.specialWeather;
		if (!sw.active) return;
		const def = this.allSpecialWeathers[sw.active];
		sw.elapsed += dt;

		if (sw.elapsed < def.fadeSeconds) {
			sw.blend = sw.elapsed / def.fadeSeconds;
		} else if (sw.elapsed < sw.duration - def.fadeSeconds) {
			sw.blend = 1;
		} else if (sw.elapsed < sw.duration) {
			sw.blend = (sw.duration - sw.elapsed) / def.fadeSeconds;
		} else {
			console.log(`Special weather ending: ${def.name}`);
			sw.active = null;
			sw.blend = 0;
			this.cloudManager.allowClouds();
		}
	},
	skyBody: {
		current: "sun"
	},
	updateSkyBody: function() {
		this.skyBody.current = this.dayNight.isDay ? "sun" : "moon";
	},
	// OCEAN EVENTS
	oceanEvents: [],
	oceanEventsByDigit: {}, // last digit of the date -> event def
	activeOceanEvent: null,
	lastOceanEventCheckDate: null, // "YYYY-M-D" cache key so this only computes once per real day

	addOceanEvent: function(data) {
		this.oceanEvents.push(data);
		for (const digit of data.dateDigits) {
			this.oceanEventsByDigit[digit] = data;
		}
	},

	checkOceanEvent: function() {
		const now = new Date();
		const dateKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
		if (dateKey === this.lastOceanEventCheckDate) return; // already resolved today

		this.lastOceanEventCheckDate = dateKey;
		this.activeOceanEvent = this.oceanEventsByDigit[now.getDate() % 10] || null;

		if (this.activeOceanEvent) console.log(`Ocean event today: ${this.activeOceanEvent.name}`);
	},
    textColors: {
        dark:"#222222",
        light:"#eeeeee"
    },
	getEnvColors: function() {
		// this is visually the most important thing in the whole game
		const w = Game.weather;
		const from = Game.allWeathers[w.current].colors;
		const to = w.target ? Game.allWeathers[w.target].colors : from;
		const t = w.target ? w.blend : 0;

		let skyTop = lerpColor(from.skyTop, to.skyTop, t);
		let skyBottom = lerpColor(from.skyBottom, to.skyBottom, t);
		let waterShallow = lerpColor(from.waterShallow, to.waterShallow, t);
		let waterDeep = lerpColor(from.waterDeep, to.waterDeep, t);

		const event = Game.activeOceanEvent;
		if (event && event.waterTint) {
			const s = event.tintStrength ?? 0.3;
			waterShallow = lerpColor(waterShallow, event.waterTint, s * 0.4);
			waterDeep = lerpColor(waterDeep, event.waterTint, s * 0.9);
		}

		// --- arcProgress (0→1 during day, 0→1 during night) ---
		const arcProgress = Game.dayNight.isDay ?
			Game.dayNight.progress / 0.5 :
			(Game.dayNight.progress - 0.5) / 0.5;

		// Night darkness: 0 at both twilight boundaries, 1 at midnight
		const nightDarkness = !Game.dayNight.isDay ?
			Math.sin(arcProgress * Math.PI) :
			0;

		// --- Twilight strengths (only near the horizon) ---
		let sunsetStrength = 0;
		let sunriseStrength = 0;

		if (Game.dayNight.isDay) {
			// Day: sunrise near 0, sunset near 1
			sunriseStrength = Math.max(0, Math.min(1, (0.15 - arcProgress) / 0.15));
			sunsetStrength = Math.max(0, Math.min(1, (arcProgress - 0.85) / 0.15));
		} else {
			// Night: sunset near 0, sunrise near 1
			sunsetStrength = Math.max(0, Math.min(1, (0.15 - arcProgress) / 0.15));
			sunriseStrength = Math.max(0, Math.min(1, (arcProgress - 0.85) / 0.15));
		}

		const orange = "#fc8803";
		const nightTop = "#08010d";
		const nightBottom = "#0d0a1a";
		const edgeStrength = Math.max(sunsetStrength, sunriseStrength);

		// ---- Apply night darkness (to both top and bottom) ----
		if (nightDarkness) {
			skyBottom = lerpColor(skyBottom, nightBottom, nightDarkness);
			skyTop = lerpColor(skyTop, nightTop, nightDarkness * 2);
		}
		// ---- Apply twilight glow ----
		if (edgeStrength > 0.01) {
			skyBottom = lerpColor(skyBottom, orange, edgeStrength);
			// Top gets a softer, weaker orange
			const topStrength = edgeStrength * 0.4;
			skyTop = lerpColor(skyTop, orange, topStrength);
			waterShallow = lerpColor(waterShallow, orange, topStrength*2);
		}
		const topGlowColor = "#ffaa55";
		skyTop = lerpColor(skyTop, topGlowColor, edgeStrength * 0.4);
		if (nightDarkness) {
			skyBottom = lerpColor(skyBottom, nightBottom, nightDarkness);
			skyTop = lerpColor(skyTop, nightTop, nightDarkness*1.5);
		}

		const special = Game.specialWeather.active ? Game.allSpecialWeathers[Game.specialWeather.active] : null;
		if (special) {
			const sb = Game.specialWeather.blend;
			skyTop = lerpColor(skyTop, special.skyColor, sb * 0.8);
			skyBottom = lerpColor(skyBottom, special.skyColor, sb * 0.3);
			waterShallow = lerpColor(waterShallow, special.waterTint, sb * 0.4);
			waterDeep = lerpColor(waterDeep, special.waterTint, sb * 0.3);
		}

		// Why are these NaN 
		if (Game.ascension.state !== "idle") {
			//console.log(Game.ascension.timer / 1000);
			waterDeep = lerpColor(waterDeep, "#080106", Math.min(0.9, Game.ascension.progress / 1000));
			waterShallow = lerpColor(waterShallow, "#080106", Math.min(0.9, Game.ascension.progress / 1000));
			skyBottom = lerpColor(skyBottom, "#080106", Math.min(0.5, Game.ascension.progress / 1000));
			//console.log(waterDeep);
		}
		/*if (Game.ascension.state === "rising") {
			waterDeep = lerpColor(waterDeep, "#080106", 0.9);
			waterShallow = lerpColor(waterShallow, "#080106", 0.7);
			skyBottom = lerpColor(skyBottom, "#080106", 0.5);
		}*/
		return {
			skyTop,
			skyBottom,
			waterShallow,
			waterDeep
		};
	},
	skyBody: {
		current: "sun"
	},
	skyBodyFrames: {
		sun: {
			col: 0,
			row: 0
		},
		moon: {
			col: 1,
			row: 0
		},
		eclipse: {
			col: 0,
			row: 1
		},
		cookie: {
			col: 1,
			row: 1
		}
	},
	skyBodyTileSize: 64,

	updateSkyBody: function() {
		const special = this.specialWeather.active ? this.allSpecialWeathers[this.specialWeather.active] : null;
		this.skyBody.current = special?.sunFrame || (this.dayNight.isDay ? "sun" : "moon");

		this.updateGameText()
	},
	updateGameText: function() {
		updateTextColor(Game.displayText, Game.textColors.dark, Game.textColors.light);
		updateTextColor(Game.fishPerSecDisplay, Game.textColors.dark, Game.textColors.light);
	},	

	drawSkyBody: function() {
		const sheet = Game.imgs["flo_sky_bodies"];
		if (!sheet || !sheet.complete) return;

		const frame = Game.skyBodyFrames[Game.skyBody.current];
		if (!frame) return;

		// Simple arc across the sky driven by the day/night clock
		const arcProgress = Game.dayNight.isDay ?
			Game.dayNight.progress / 0.5 :
			(Game.dayNight.progress - 0.5) / 0.5;

		const x = arcProgress * (Game.canvas.width + 128) - 64;
		const y = Game.waterLine - Math.sin(arcProgress * Math.PI) * (Game.waterLine * 0.65);
		const size = Game.skyBodyTileSize;
		Game.ctx.save()
		Game.ctx.shadowBlur = Game.dayNight.isDay ?
			"10px" :
			"1px";
		Game.ctx.shadowColor = Game.dayNight.isDay ?
			'#ffaaaa' :
			'#aaaaaa';
		drawFromSheet(Game.ctx, sheet, frame.col, frame.row, size, x - size / 2, y - size / 2,2);
		Game.ctx.restore()
	},
	dayNight: {
		progress: 0,
		cycleSeconds: 697, // have an elite day
		isDay: true
	},
	updateDayNight: function(dt) {
		const dn = this.dayNight;
		dn.progress += dt / dn.cycleSeconds;
		if (dn.progress >= 1) dn.progress -= 1;
		var isDay = dn.progress < 0.5;
		
		if (isDay != dn.isDay) {
			dn.isDay = isDay;
			Game.fishDirty = true;
			Game.applyEnvironmentalStats();
		}
	},

	cloudManager: {
		clouds: [],
		maxClouds: 40,
		spawnPaused: false,
		frames: [
			{
				col: 0,
				row: 0
		},
			{
				col: 1,
				row: 0
		},
			{
				col: 0,
				row: 1
		},
		{
				col: 1,
				row: 1
		}], 
		tileWidth: 64, 
		tileHeight: 64, //

		spawnChancePerSecond: {
			clear: 0.1,
			cloudy: 0.6,
			rainy: 0.8,
			stormy: 1.0
		},

		update: function(dt) {
			if (!this.spawnPaused && this.clouds.length < this.maxClouds) {
				const chance = this.spawnChancePerSecond[Game.weather.current] ?? 0.1;
				if (Math.random() < chance * dt) this.spawnCloud();
			}

			for (let i = this.clouds.length - 1; i >= 0; i--) {
				const c = this.clouds[i];
				const speed = c.leaving ? c.speed * 3 : c.speed;
				c.x += speed * dt * c.direction;

				const offscreen = c.x < -this.tileWidth * 2 || c.x > Game.canvas.width + this.tileWidth * 2;
				if (c.leaving && offscreen) this.clouds.splice(i, 1);
			}
		},

		spawnCloud: function(x,y) {
			const direction = Math.random() < 0.5 ? -1 : 1;
            var cloud = {
				x: direction === 1 ? -this.tileWidth : Game.canvas.width + this.tileWidth,
				y: 20 + Math.random() * (Game.waterLine * 0.5),
				speed: 8 + Math.random() * 12,
				direction,
				frame: choose(this.frames),
				leaving: false,
				alpha: 0.85 + Math.random() * 0.15
			}
            if (x) cloud.x = x;
            if (y) cloud.y = y;
			this.clouds.push(cloud);
		},
        initialClouds: function(){
            var MAX_INITIAL = Math.floor(this.spawnChancePerSecond[Game.weather.current]*10);
            for (var i=0;i<=MAX_INITIAL;i++){
                this.spawnCloud(Math.random()*Game.canvas.width);
                }
        },
		tellCloudsToLeave: function() {
			this.spawnPaused = true;
			for (const c of this.clouds) c.leaving = true;
		},

		allowClouds: function() {
			this.spawnPaused = false;
		},

		draw: function(ctx) {
			const sheet = Game.imgs["flo_clouds"];
			if (!sheet || !sheet.complete) return;

			for (const c of this.clouds) {
				ctx.save();
				ctx.globalAlpha = c.alpha;
				drawFromSheetRect(ctx, sheet, c.frame.col, c.frame.row, this.tileWidth, this.tileHeight, c.x, c
					.y, 1, c.direction > 0);
				ctx.restore();
			}
		}
	},

	// PARTICLES
	particles: [],
	spawnParticle: function(x, y, text = false, img = false, col = false, isFish = false, fishCol = 0, fishRow =
		0) {
		const particle = this.particles.find(p => !p.active);
		if (!particle) return;

		particle.active = true;
		particle.x = x;
		particle.y = y;
		particle.alpha = 1.0;

		// Reset types
		particle.text = text;
		particle.isFish = isFish;

		if (isFish) {
			particle.fishCol = fishCol;
			particle.fishRow = fishRow;

			// Random upward arc trajectory
			particle.velocityX = (Math.random() - 0.5) * 200; // Left or right splash
			particle.velocityY = -350 - Math.random() * 150; // Upward burst
			particle.gravity = 800; // Pull back down
			particle.rotation = Math.random() * Math.PI;
			particle.rotationSpeed = (Math.random() - 0.5) * 6;
			particle.scale = 1.2;
		} else {
			// Standard text floating behavior
			particle.text = text;
			particle.velocityX = 0;
			particle.velocityY = -60;
			particle.gravity = 0;
			particle.rotation = 0;
			particle.rotationSpeed = 0;
			particle.scale = 1;
		}
	},
	updateParticles: function(dt) {
		for (let i = 0; i < this.particles.length; i++) {
			const p = this.particles[i];
			if (!p.active) continue;

			p.x += p.velocityX * dt;
			p.y += p.velocityY * dt;
			p.velocityY += p.gravity * dt; // Apply gravity for physics arc
			p.rotation += p.rotationSpeed * dt;

			if (p.isFish) {
				// Fade out as it hits/passes the water line on the way down
				if (p.velocityY > 0 && p.y >= this.waterLine) {
					p.alpha -= 4 * dt;
				}
			} else {
				p.alpha -= 1.2 * dt;
			}

			if (p.alpha <= 0) p.active = false;
		}
	},

	drawParticles: function() {
		const fishSheet = Game.imgs["flo_fish"];

		for (let i = 0; i < this.particles.length; i++) {
			const p = this.particles[i];
			if (!p.active) continue;

			if (p.isFish && fishSheet && fishSheet.complete) {
				this.ctx.save();
				this.ctx.globalAlpha = Math.max(0, p.alpha);

				// Translate to particle position for clean rotation
				this.ctx.translate(p.x, p.y);
				this.ctx.rotate(p.rotation);

				const tileSize = 32;
				const dw = tileSize * p.scale;
				const dh = tileSize * p.scale;

				this.ctx.drawImage(
					fishSheet,
					p.fishCol * tileSize,
					p.fishRow * tileSize,
					tileSize,
					tileSize,
					-dw / 2,
					-dh / 2,
					dw,
					dh
				);
				this.ctx.restore();
			} else if (p.text) {
				this.ctx.font = "bold 22px monospace";

                var color = Game.dayNight.isDay ? Game.textColors.dark : Game.textColors.light;
                color = colorToRgb(color);
				this.ctx.fillStyle = `rgba(${color.r},${color.g},${color.b}, ${Math.max(0, p.alpha)})`;
				this.ctx.fillText(p.text, p.x, p.y);
			}
		}
	},

	maxParticles: 50,
	setupParticlePool: function() {
		for (let i = 0; i < this.maxParticles; i++) {
			this.particles.push({
				active: false,
				x: 0,
				y: 0,
				alpha: 1,
				velocityY: 0
			});
		}
	},
	// DRAWING THE BOAT
	boat: {
		scale: 1,
		recoil: 0,
		tilt: 0, // Current tilt angle (radians)
		targetTilt: 0, // Hover target tilt angle (radians)
		isHovered: false
	},
	env: { // environment, weather, the colour of the sea
		waveHeight: 0.15, // 0.1 for mid and calm, 0.5 for choppy
		waveSpeed: 1,
		waveLength: 160
	},

	updateBoat: function(dt) {
		this.boat.recoil += (1.0 - this.boat.scale) * 15 * dt;
		this.boat.scale += this.boat.recoil;
		this.boat.recoil *= 0.85;

		// Exponential lerp towards target tilt
		this.boat.tilt += (this.boat.targetTilt - this.boat.tilt) * 0.05 * dt;

	},
	/// BOAT DRAWING 
	drawBoat: function(dt) {

		const wave =
			Math.sin(
				this.env.waveLength +
				Game.time * this.env.waveSpeed
			) * this.env.waveHeight * 10;

		const y = this.waterLine + 8 + wave;

		const boatBack = Game.imgs["flo_boatback"];
		const boatFront = Game.imgs["flo_boatfront"];

		this.ctx.save();
		this.ctx.translate(Game.centerX-(boatFront.width)/2, y);
		this.ctx.rotate(this.boat.tilt + (wave /75)); // Combine hover tilt + wave roll
		this.ctx.scale(this.boat.scale, this.boat.scale);
		
		if (boatBack.complete) {
			Game.ctx.drawImage(
				boatBack,
				-boatBack.width / 2,
				-boatBack.height*2,
				boatFront.width*2,
				boatFront.height*2
			);
		}

		// Draw Player
		const playerSheet = Game.imgs["flo_chars"];
		const testData = {
			"char": 0,
			"costume": 0
		};

		if (playerSheet.complete) {
			if (Game.ascension.state === "sinking") {
				// During ascension, draw the player with a fade-out effect
				Game.ctx.save();
				const fadeAmount = Math.max(0, 1 - Game.ascension.progress);
				Game.ctx.globalAlpha = fadeAmount;
				drawFromSheet(
					Game.ctx,
					playerSheet,
					testData.char,
					testData.costume,
					16,
					8,
					-50+Game.ascension.timer, // Move player upward during ascension
					2,
					true
				);
				Game.ctx.restore();
			} else {
				// Normal drawing when not ascending
				drawFromSheet(
					Game.ctx,
					playerSheet,
					testData.char,
					testData.costume,
					16,
					8,
					-50,
					2,
					true
				);
			}
		}

		if (boatFront.complete) {
			Game.ctx.drawImage(
				boatFront,
				-boatFront.width / 2,
				-boatFront.height*2, 
				boatFront.width*2,
				boatFront.height*2
			);
		}
		Game.ctx.restore();
	},
	weatherWaveParams: {
		"clear":  { ampMult: 0.8, freqMult: 1.5, chop: 0.3 },
		"cloudy": { ampMult: 0.95, freqMult: 1.1, chop: 0.4 },
		"rainy":  { ampMult: 1.3, freqMult: 1.3, chop: 0.5 },
		"stormy": { ampMult: 4.0, freqMult: 2.0, chop: 0.9 }
	},

	getWaveParams: function() {
		const w = Game.weather;
		const from = Game.weatherWaveParams[w.current];
		const to = w.target ? Game.weatherWaveParams[w.target] : from;
		const t = w.target ? w.blend : 0;

		return {
			ampMult: from.ampMult + (to.ampMult - from.ampMult) * t,
			freqMult: from.freqMult + (to.freqMult - from.freqMult) * t,
			chop: from.chop + (to.chop - from.chop) * t
		};
	},
	drawWave: function(ctx, startX, endX, baseline, waveLength, amp, phase, pointiness = 0.85) {
		const half = waveLength / 2;
		let x = startX - (((phase % waveLength) + waveLength) % waveLength) - half;

		const troughY = baseline + amp * 0.45;
		const peakY = baseline - amp;

		ctx.moveTo(x, troughY);

		while (x < endX + waveLength) {
			const peakX = x + half;
			const nextTroughX = x + waveLength;
			const riseControlX = x + half * pointiness;
			ctx.quadraticCurveTo( // this is my new favourite functio
				riseControlX, troughY,
				peakX, peakY
			);
			const fallControlX = peakX + half * (1 - pointiness);
			ctx.quadraticCurveTo(
				fallControlX, troughY,
				nextTroughX, troughY
			);

			x = nextTroughX;
		}
	},
	drawBG: function() {
		const ctx = Game.ctx;
		const width = Game.canvas.width;
		const height = Game.canvas.height;
		const colors = Game.getEnvColors();
		const params = Game.getWaveParams();

		const skyGradient = ctx.createLinearGradient(0, 0, 0, Game.waterLine);
		skyGradient.addColorStop(0, colors.skyTop);
		skyGradient.addColorStop(0.9, colors.skyBottom);
		skyGradient.addColorStop(1, colors.skyBottom);
		ctx.fillStyle = skyGradient;
		ctx.fillRect(0, 0, width, Game.waterLine);

		const waveLength = this.env.waveLength * 1.2;
		const amp = this.env.waveHeight * 10 * params.ampMult * 0.5; // subtler than the foreground layers

		const oceanBgGradient = ctx.createLinearGradient(0, Game.waterLine - amp, 0, height);
		oceanBgGradient.addColorStop(0, lerpColor(colors.waterShallow,"#0a0812",0.3));
		oceanBgGradient.addColorStop(1, lerpColor(colors.waterShallow,"#0a0812",0.4));

		ctx.fillStyle = oceanBgGradient;
		ctx.beginPath();
		Game.drawWave(ctx, 0, width, Game.waterLine, waveLength, amp, Game.time * 20 * params.freqMult, 0.7);
		ctx.lineTo(width, height);
		ctx.lineTo(0, height);
		ctx.closePath();
		ctx.fill();
	},

	drawWater: function(dt, intensity,s,secondPass=true) {
		const ctx = Game.ctx;
		const width = Game.canvas.width;
		const height = Game.canvas.height;
		const colors = Game.getEnvColors();
		const params = Game.getWaveParams();

		ctx.globalAlpha = Math.min(1, 0.35*intensity);
		
		const fgCol = colorToRgb(lerpColor(colors.waterShallow, "#1c2a6e", s));

		// LAYER 1: background wave (bigger wavelength, slower, softer points)
		const bgWaterGradient = ctx.createLinearGradient(0, Game.waterLine - 10, 0, height);
		
		bgWaterGradient.addColorStop(0, rgbToRgba(fgCol, Math.min(1,0.4*intensity)));
		bgWaterGradient.addColorStop(1, rgbToRgba(colorToRgb(colors.waterDeep),Math.min(1,0.6*intensity)));

		ctx.fillStyle = bgWaterGradient;
		ctx.beginPath();
		Game.drawWave(
			ctx, 0, width, Game.waterLine - 6,
			this.env.waveLength * 1.4, this.env.waveHeight * 10 * params.ampMult * 0.8,
			Game.time * 12 * params.freqMult, 0.6
		);
		ctx.lineTo(width, height);
		ctx.lineTo(0, height);
		ctx.closePath();
		ctx.fill();
		ctx.globalAlpha = 1;
		if (!secondPass) return;
		// LAYER 2: foreground wave (shorter wavelength, faster, sharper points)
		ctx.globalAlpha = Math.min(1, 0.4*intensity);
		const fgWaterGradient = ctx.createLinearGradient(0, Game.waterLine - 2, 0, height);
		fgWaterGradient.addColorStop(0, rgbToRgba(fgCol, Math.min(1,0.3*intensity)));
		fgWaterGradient.addColorStop(0.4, rgbToRgba(colorToRgb(colors.waterDeep),Math.min(1,0.3*intensity)));
		fgWaterGradient.addColorStop(1, rgbToRgba(colorToRgb(colors.waterDeep),Math.min(1,0.5*intensity)));

		ctx.fillStyle = fgWaterGradient;
		ctx.beginPath();
		Game.drawWave(
			ctx, 0, width, Game.waterLine - 2,
			this.env.waveLength, this.env.waveHeight * 10 * params.ampMult,
			Game.time * 24 * params.freqMult, 0.85
		);
		ctx.lineTo(width, height);
		ctx.lineTo(0, height);
		ctx.closePath();
		ctx.fill();

		ctx.globalAlpha = 1;
	},
	// SPRITE LOADING
	spritesOnBoot: { // named to avoid namespace collision, feel free to mod some in
		"flo_fish": "https://raw.githubusercontent.com/FloTheWiz/miscc/refs/heads/main/fish_spritesheet.png",
		"flo_boatfront": "https://raw.githubusercontent.com/FloTheWiz/miscc/refs/heads/main/boat-front.png",
		"flo_boatback": "https://raw.githubusercontent.com/FloTheWiz/miscc/refs/heads/main/boat-back.png",
		"flo_chars": "https://raw.githubusercontent.com/FloTheWiz/miscc/refs/heads/main/betterchars.png",
		"flo_portraits": "https://raw.githubusercontent.com/FloTheWiz/miscc/refs/heads/main/portraits3x2.png",
		"flo_icons_ui": "https://raw.githubusercontent.com/FloTheWiz/miscc/refs/heads/main/fish_spritesheetx2.png",
		"flo_sky_bodies": "https://raw.githubusercontent.com/FloTheWiz/miscc/refs/heads/main/suns.png",
		"flo_clouds": "https://raw.githubusercontent.com/FloTheWiz/miscc/refs/heads/main/normalclouds.png"
	},

	imgs: {},
	loadSprite: function(name, url) {
		const newimg = new Image();

		newimg.src = url;

		Game.imgs[name] = newimg;

		return newimg;
	},

	bootSprites: function() {
		for (const id in Game.spritesOnBoot) {
			Game.loadSprite(id, Game.spritesOnBoot[id]);
		}
	},

	// Fish Managers
	allFish: [],
	allFishById: {},
	addFish: function(data) {
		Game.allFish.push(data);
		Game.allFishById[data.fid] = data
	},
    // MaxFish 50, Initial 20
	maxSpawnedFish: 50,
	spawnedFish: [],
	checkFishSpawn: function() {
		// Checks if a fish can spawn or not
		if (Game.spawnedFish.length < Game.maxSpawnedFish) {
			if (Math.random() < 0.8) {
				Game.spawnFish();
			}
		}
	},
	spawnFish: function(x,y) {
		const poolFish = Game.allFish.filter(fish => fish.unlocked);

		if (poolFish.length === 0) return;

		const definition = choose(poolFish);
		const direction = Math.random() < 0.5 ? -1 : 1
		const fish = {
			definition: definition,

			x: direction === 1 ? 0 - 30 - Math.random() * 20 : this.canvas.width + 30 + Math.random() * 20,

			y: Math.min(Math.max(this.waterLine +
				definition.yPref +
				Math.random() * definition.yRange, this.waterLine + 50), this.canvas.height - 30),

			direction: direction,

			speed: definition.speedBase + Math.random() * definition.speedRange,

			velocityX: 0,
			velocityY: 0,

			phase: Math.random() * Math.PI * 2,

			state: choose(definition.swimStates)
		};
        if (x) fish.x = x;
        if (y) fish.y = y;
		Game.spawnedFish.push(fish);
		//console.log(`Spawned fish at: ${fish.x},${fish.y} facing ${fish.direction}`);

	},
    initialFish: function(){
        const initial = 20;
        for (var x=0;x <= initial;x++){
            Game.spawnFish(Math.random()*this.canvas.width,Math.random()*this.waterline*0.95);
        }
    },
	updateFish: function(dt) {
		for (const fish of Game.spawnedFish) {
			fish.definition.swimPattern(fish, dt);

			fish.x += fish.velocityX * dt;
			fish.y += fish.velocityY * dt;

			// Turn around at the edges.
			if (fish.x < -40) {
				fish.x = -40;
				fish.direction = 1;
			}

			if (fish.x > Game.canvas.width + 40) {
				fish.x = Game.canvas.width + 40;
				fish.direction = -1;
			}
		}
	},

	drawFish: function() {
		const fishSheet = Game.imgs["flo_fish"];

		if (!fishSheet.complete) return;

		for (const fish of Game.spawnedFish) {
			const definition = fish.definition;

			drawFromSheet(
				Game.ctx,
				fishSheet,
				definition.column,
				definition.row,
				32,
				fish.x,
				fish.y,
				1,
				fish.direction > 0
			);
		}
	},

	/// UI /////////////////////////////////////////////
	// Turns out, a lot of an idle game is in the UI. 
	// this is godot slander btw
	moods: [

	],
	uiSheets: {

	},
	renderIcon: function(sheetKey, col, row, tileSize = 64) {
		const el = document.createElement("div");
		el.className = "spriteIcon";
		el.style.width = tileSize + "px";
		el.style.height = tileSize + "px";
		el.style.backgroundImage = `url("${Game.spritesOnBoot[sheetKey]}")`;
		el.style.backgroundPosition = `-${col * tileSize}px -${row * tileSize}px`;

		return el;
	},
	renderNpcPortrait: function(npc, columnIndex = 1) { // 1 = neutral face
		const wrap = document.createElement("div");
		wrap.className = "portraitCont";

		const portImg = document.createElement("div");
		portImg.className = "portrait"
		portImg.style = `background-position:-${columnIndex * 128}px -${npc.row * 128}px;`;

		wrap.appendChild(portImg);

		const frameImg = document.createElement("div");
		frameImg.className = "frame";
		frameImg.style = `background-position: 0px -${npc.row * 128}px`;
		wrap.appendChild(frameImg);
		return wrap;
	},
	npcs: {
		// Spritesheet is 4 Rows of 4 Columns, 128 each, the first column is their "frame", the second is face (neutral), third is face (happy), fourth is face (angry)
		shopkeeper: {
			name: "???",
			spritesheet: "flo_portraits",
			row: 1
		},
		harbormaster: {
			name: "Harvey",
			spritesheet: "flo_portraits",
			row: 2
		},
		cultist: {
			name: "????",
			spritesheet: "flo_portraits",
			row: 0
		}
	},

	// PANELS (upgrade menu, building menu, settings, etc)
	// thank you mr orteil minigames :D
	makePanelBorder: function(id,side){
		const div = document.createElement('div');
		div.classList.add(...["panelBorder",`${id}Border`,`${side}Border`]);
		return div
	},
	panels: {
		cultist: {
			side: "left",
			el: null,
			toggleImg: null,
			open: false,
			npc: "cultist",
			build: function(div) {
				div.innerHTML = "<h2>The Shadow Shop</h2>";
				const npc = Game.npcs[this.npc];
				if (npc) div.appendChild(Game.renderNpcPortrait(npc));

				const list = document.createElement("div");
				list.className = "panelList";

				for (const upgrade of Game.getShopUpgrades("cultist")) {
					if (upgrade.purchased) continue;

					const unlocked = Game.isUpgradeUnlocked(upgrade);
					const teased = Game.isUpgradeTeased(upgrade);
					if (!unlocked && !teased) continue;

					const btn = Game.renderShopItem(upgrade, {
						unlocked: unlocked,
						iconSize: unlocked ? 64 : 32,
						mainLabel: (u) => `${u.name} (${u.cost} fish)`,
						affordable: Game.currentFish >= upgrade.cost,
						onBuy: (u) => Game.buyUpgrade(u.id),
						dataType: "upgrade",
						requires: upgrade.requires,
						isDone: (id) => Game.upgradesById[id]?.purchased,
						lookupName: (id) => Game.upgradesById[id]?.name
					});

					list.appendChild(btn);
				}

				div.appendChild(Game.makePanelBorder('cultist', this.side));
				div.appendChild(list);

				// Ascend stays available regardless of shop stock
				const ascendBtn = document.createElement("button");
				ascendBtn.id = "ascendButton";
				ascendBtn.textContent = "ASCEND!";
				ascendBtn.onclick = () => Game.ascension.ascend();
				div.appendChild(ascendBtn);
			}
		},
		upgrade: {
			side: "right",
			el: null,
			toggleImg: null,
			open: false,
			npc: "shopkeeper",
			build: function(div) {
				div.innerHTML = "<h2>Upgrades</h2>";
				const npc = Game.npcs[this.npc];
				if (npc) div.appendChild(Game.renderNpcPortrait(npc));

				const list = document.createElement("div");
				list.className = "panelList";
				for (const upgrade of Game.getShopUpgrades("upgrade")) {
					if (upgrade.purchased) continue;

					const unlocked = Game.isUpgradeUnlocked(upgrade);
					const teased = Game.isUpgradeTeased(upgrade);
					if (!unlocked && !teased) continue;

					const btn = Game.renderShopItem(upgrade, {
						unlocked: unlocked,
						iconSize: unlocked ? 64 : 32,
						mainLabel: (u) => `${u.name} (${u.cost} fish)`,
						affordable: Game.currentFish >= upgrade.cost,
						onBuy: (u) => Game.buyUpgrade(u.id),
						dataType: "upgrade",
						requires: upgrade.requires,
						isDone: (id) => Game.upgradesById[id]?.purchased,
						lookupName: (id) => Game.upgradesById[id]?.name
					});

					list.appendChild(btn);
				}
				div.appendChild(Game.makePanelBorder('upgrade',this.side));
				div.appendChild(list);
			}
		},
		building: {
			side: "left",
			el: null,
			toggleImg: null,
			open: false,
			npc: "harbormaster",
			build: function(div) {
				div.innerHTML = "<h2>Buildings</h2>";
				const npc = Game.npcs[this.npc];
				if (npc) div.appendChild(Game.renderNpcPortrait(npc));
				//div.style.paddingeft = "40px;"
				const list = document.createElement("div");
				list.className = "panelList";

				for (const building of Game.buildings) {
					const unlocked = Game.isBuildingUnlocked(building);
					const teased = Game.isBuildingTeased(building);
					if (!unlocked && !teased) continue;

					const cost = Game.buildingCost(building);

					const btn = Game.renderShopItem(building, {
						unlocked: unlocked,
						iconSize: unlocked ? 64 : 32,
						mainLabel: (b) =>
							`${b.name} x${b.owned} (${cost} fish)`, // stackable, so show owned count
						affordable: Game.currentFish >= cost,
						onBuy: (b) => Game.buyBuilding(b.id),
						dataType: "building",
						requires: building.requires,
						isDone: (id) => Game.upgradesById[id]?.purchased || Game.buildingsById[id]
							?.owned > 0,
						lookupName: (id) => Game.upgradesById[id]?.name || Game.buildingsById[id]?.name
					});

					list.appendChild(btn);
				}
				div.appendChild(list);
				div.appendChild(Game.makePanelBorder('building',this.side));
			}
		},
		settings: {
			side: "right",
			el: null,
			toggleImg: null,
			open: false,
			build: function(div) {

			}
		}
	},
	hookMenu: function() {
		for (const id in this.panels) {
			const panel = this.panels[id];
			panel.el = getEle(id + "Container");
			panel.toggleImg = getEle(id + "Toggle");
			if (panel.build) panel.build(panel.el); // <-- initial render
		}
	},

	refreshPanel: function(id) {
		const panel = this.panels[id];
		if (panel && panel.build) panel.build(panel.el);
	},

	togglePanel: function(id) {
		const panel = this.panels[id];
		if (!panel || !panel.el) return;

		panel.open = !panel.open;
		panel.el.classList.toggle("open", panel.open);

		if (panel.toggleImg) {
			panel.toggleImg.style.transform = panel.open ? `rotate(${panel.side==="right" ? "-90deg" : "90deg"})` : "rotate(0deg)";
			if (panel.side==="right") {
				//console.log("OPEN SESAME")
				//getEle(id+"Toggle")
				panel.toggleImg.style.right = panel.open ? "400px" : "0px";
				//console.error("wee woo");
				//throw new Error("what")
				return;
			}
			if (panel.side==="left") {
				panel.toggleImg.style.left = panel.open ? "400px" : "0px";
				return;
			}
		}
	},
	updateShopAffordability: function() {
		for (const panelId of ["upgrade", "building"]) {
			const panel = Game.panels[panelId];
			if (!panel.el) continue;

			const buttons = panel.el.querySelectorAll("button.shopBtn[data-item-id]");
			for (const btn of buttons) {
				if (btn.classList.contains("locked")) continue;

				if (btn.dataset.itemType === "upgrade") {
					const upgrade = Game.upgradesById[btn.dataset.itemId];
					if (upgrade) btn.disabled = Game.currentFish < upgrade.cost;
				} else if (btn.dataset.itemType === "building") {
					const building = Game.buildingsById[btn.dataset.itemId];
					if (building) btn.disabled = Game.currentFish < Game.buildingCost(building);
				}
			}
		}
	},
	// UPGRADES 
	
	upgrades: [],
	upgradesById: {},
	addUpgrade: function(data) {
		data.shop = data.shop || "upgrade"; // "upgrade" (shopkeeper) or "cultist" (shadow shop)
		Game.upgrades.push(data);
		Game.upgradesById[data.id] = data;
	},

	getShopUpgrades: function(shopId) {
		return Game.upgrades.filter(u => (u.shop || "upgrade") === shopId);
	},
	isUnlocked: function(requires, isDoneFn) {
		return requires.every(id => isDoneFn(id));
	},

	isTeased: function(requires, isDoneFn) {
		if (requires.length === 0) return false;
		return requires.some(id => isDoneFn(id));
	},
	isUpgradeUnlocked: function(upgrade) {
		return Game.isUnlocked(upgrade.requires, id => Game.upgradesById[id]?.purchased);
	},
	isUpgradeTeased: function(upgrade) {
		return Game.isTeased(upgrade.requires, id => Game.upgradesById[id]?.purchased);
	},
	makeShopTooltip: function(button, item){
		var side = "left"
		if (item.shop == "upgrade") side = "right";


	},
	renderShopItem: function(item, opts) {
		const btn = document.createElement("button");
		btn.classList.add("shopBtn");
		btn.dataset.itemId = item.id;
		btn.dataset.itemType = opts.dataType;

		if (opts.unlocked) {
			btn.appendChild(Game.renderIcon(item.icon.sheet, item.icon.col, item.icon.row, opts.iconSize));
			var label = document.createElement('div');
			label.className = "shopItem";
			console.log(item)
			label.innerHTML = `
				<span class="shopItemText">${item.name}</span>
				<span${item["desc"] || "A really cool item"}</span>
				<span>${item.cost} Fish</span>
				`;
			/*
			const label = document.createElement("span");
			label.textContent = item.name;
			//label.textContent = opts.mainLabel(item);
			*/
			btn.appendChild(label);

			btn.classList.remove("locked");
			btn.disabled = !opts.affordable;
			btn.addEventListener("click", () => opts.onBuy(item));
			//btn.addEventListener("hover", () => )
		} else {
			console.log(`${item.name} is Locked`)
			btn.appendChild(Game.renderIcon(item.icon.sheet, item.icon.col, item.icon.row, opts.iconSize));
			btn.classList.add("locked", "silhouette");

			const missing = opts.requires
				.filter(id => !opts.isDone(id))
				.map(id => opts.lookupName(id) || "???");

			const label = document.createElement("span");
			label.textContent = `??? (requires: ${missing.join(", ")})`;
			btn.appendChild(label);

			btn.disabled = true;
		}

		return btn;
	},
	buyUpgrade: function(id) {
		const upgrade = Game.upgrades.find(u => u.id === id);
		if (!upgrade || upgrade.purchased || Game.currentFish < upgrade.cost) return;

		Game.currentFish -= upgrade.cost;
		upgrade.purchased = true;
		//if (upgrade.onBuy) upgrade.onBuy(upgrade); // still used for non-stat side effects, e.g. unlocking a fish

		Game
			.syncUpgradeStatModifiers(); // recomputes fishPerClick / fishPerSecMult from every purchased upgrade's `effects`
		Game.updateFishDisplay();
		Game.refreshPanel("upgrade");
		Game.fishDirty = true;
	},
	// BUILDINGS
	buildings: [],
	buildingsById: {},
	addBuilding: function(data) {
		data.owned = data.owned || 0;
		data.rateMult = 1;
		Game.buildings.push(data);
		Game.buildingsById[data.id] = data;
	},

	buildingCost: function(building) {
		return Math.ceil(building.baseCost * Math.pow(building.costScale || 1.15, building.owned));
	},

	isBuildingUnlocked: function(building) {
		return Game.isUnlocked(building.requires, id =>
			Game.upgradesById[id]?.purchased || Game.buildingsById[id]?.owned > 0
		);
	},
	isBuildingTeased: function(building) {
		return Game.isTeased(building.requires, id =>
			Game.upgradesById[id]?.purchased || Game.buildingsById[id]?.owned > 0
		);
	},

	buyBuilding: function(id) {
		const building = Game.buildingsById[id];
		if (!building) return;
		const cost = Game.buildingCost(building);
		if (Game.currentFish < cost) return;

		Game.currentFish -= cost;
		building.owned += 1;
		if (building.onBuy) building.onBuy(building);

		Game.updateFishDisplay()
		Game.refreshPanel("building");
		Game.fishDirty = true;
	},
	recalcStats: function() {
		const stats = {
			...Game.baseStats
		};
		const buildingRateBonus = {}; // building id -> summed bonus amount
 
		for (const mod of Game.statModifiers) {
			if (mod.stat.startsWith("building:")) {
				const buildingId = mod.stat.split(":")[1];
				buildingRateBonus[buildingId] = (buildingRateBonus[buildingId] ?? 0) + mod.amount;
			} else {
				stats[mod.stat] = (stats[mod.stat] ?? 0) + mod.amount;
			}
		}
 
		Game.baseFishPerClick = stats.fishPerClick;
		Game.baseFishPerSecMult = stats.fishPerSecMult;
		Game.dayPower = stats.dayPower;
		Game.nightPower = stats.nightPower;
		Game.eclipsePower = stats.eclipsePower;
		Game.cookieStormPower = stats.cookieStormPower;
 
		for (const building of Game.buildings) {
			building.rateMult = 1 + (buildingRateBonus[building.id] ?? 0);
		}
 
		Game.applyEnvironmentalStats(); // folds day/night/eclipse/cookie-storm buffs on top -> final fishPerClick/fishPerSecMult
	},
 
	// Called every frame (day/night progress and special-weather blend both change continuously,
	// so this can't just run once per purchase like syncUpgradeStatModifiers). Reads the meta
	// "power" stats above, checks which conditions are currently true, and multiplies them onto
	// the base stats to get the FINAL fishPerClick/fishPerSecMult. Also builds activeBuffs for the UI.
	applyEnvironmentalStats: function() {
		let clickMult = 1;
		let secMult = 1;
		const buffs = [];
 
		if (Game.dayNight.isDay && Game.dayPower > 0 && !Game.specialWeather.active) {
			clickMult *= 1 + Game.dayPower;
			buffs.push({
				id: "day",
				label: `☀ Daylight Catch +${Math.round(Game.dayPower * 100)}% Fish Per Click`
			});
		}
		if (!Game.dayNight.isDay && Game.nightPower > 0 && !Game.specialWeather.active) {
			secMult *= 1 + Game.nightPower;
			buffs.push({
				id: "night",
				label: `☾ Moonlit Catch +${Math.round(Game.nightPower * 100)}% Fish Per Second`
			});
		}
 
		if (Game.specialWeather.active === "solarEclipse" && Game.eclipsePower > 0) {
			const power = Game.eclipsePower * Game.specialWeather.blend; // fades in/out with the eclipse itself
			clickMult *= 1 + power;
			buffs.push({
				id: "eclipse",
				label: `🌑 Eclipse Frenzy +${Math.round(power * 100)}%`
			});
		}
 
		if (Game.specialWeather.active === "cookieStorm" && Game.cookieStormPower > 0) {
			const power = Game.cookieStormPower * Game.specialWeather.blend;
			secMult *= 1 + power;
			buffs.push({
				id: "cookieStorm",
				label: `🍪 Cookie Rush +${Math.round(power * 100)}%`
			});
		}
 
		Game.fishPerClick = Game.baseFishPerClick * clickMult;
		Game.fishPerSecMult = Game.baseFishPerSecMult * secMult;
		Game.activeBuffs = buffs;
		Game.fishDirty = true; // fishPerSecMult feeds into fishPerSecond, so force a recalc
		Game.updateBuffDisplay();
	},
 
	// Rebuilds just the upgrade-sourced slice of statModifiers from what's currently purchased.
	// Anything else that pushes a modifier in later (temp buffs, prestige, events, whatever)
	// just needs to tag it fromUpgrade: false (or omit it) so it survives this rebuild.
	syncUpgradeStatModifiers: function() {
		Game.statModifiers = Game.statModifiers.filter(m => !m.fromUpgrade);
 
		for (const upgrade of Game.upgrades) {
			if (!upgrade.purchased || !upgrade.effects) continue;
			if (upgrade.onBuy) upgrade.onBuy(); // onbuy fires AGAIN just in case lol
			for (const stat in upgrade.effects) {
				Game.statModifiers.push({
					source: upgrade.id,
					stat,
					amount: upgrade.effects[stat],
					fromUpgrade: true
				});
			}
		}
 
		Game.recalcStats();
	},
 
	/////// CALCULATING FISH PER SECOND
	fishPerSecond: 0,
	fishPerSecMult: 1,
	fishDirty: true,
	recalcGains: function() {
		if (!this.fishDirty) return;
		var newFips = 0;
 
		for (const building of Game.buildings) {
			if (!building) continue;
			var rate = building.baseRate * building.rateMult;
			newFips += rate * building.owned;
		}
 
		newFips *= Game.fishPerSecMult; 
 
		this.fishPerSecond = newFips;
		this.fishDirty = false;
		this.showFips();
	},
	showFips: function() {
		if (!Game.fishPerSecond || Game.fishPerSecond <= 0.01) Game.fishPerSecDisplay.innerText = "";
		else Game.fishPerSecDisplay.innerText = `${Game.fishPerSecond.toFixed(1)} Fish Per Second`;
	},
	updateFishDisplay: function() {
		Game.displayText.textContent = `${Math.floor(Game.currentFish)} Fish`;
	},
	doPassive: function(dt) {
		if (Game.fishPerSecond <= 0) return;
		Game.gainFish(Game.fishPerSecond * dt);
		Game.updateFishDisplay();
	},

	// SAVE / LOAD / OFFLINE PROGRESS
	save: function(showToast = true) {
		if (!window.localStorage) {
			console.warn("Fish game: localStorage unavailable, save failed");
			return;
		}
		if (Game.isAscending) return; // don't save while ascending, it might break saves
		const data = {
			currentFish: Game.currentFish,
			fishAllTime: Game.fishAllTime,
			lastSaveTime: Date.now(),
			upgrades: Game.upgrades.map(u => ({
				id: u.id,
				purchased: u.purchased
			})),
			buildings: Game.buildings.map(b => ({
				id: b.id,
				owned: b.owned,
				rateMult: b.rateMult
			})),
			env: {
				weatherCurrent: Game.weather.current,
				weatherTarget: Game.weather.target,
				weatherBlend: Game.weather.blend,
				weatherNextCheck: Game.weatherNextCheck,
				weatherChance: Game.weatherChance,
				dayNightProgress: Game.dayNight.progress,
				specialWeather: {
					active: Game.specialWeather.active,
					duration: Game.specialWeather.duration,
					elapsed: Game.specialWeather.elapsed
				}
			}
		};

		try {
			localStorage.setItem(Game.SAVE_KEY, JSON.stringify(data));
			Game.lastSaveTime = data.lastSaveTime;
			if (showToast) Game.showSaveToast();
		} catch (e) {
			console.warn("Fish game: save failed", e);
		}
	},

	load: function() {
		let raw = null;
		try {
			raw = localStorage.getItem(Game.SAVE_KEY);
		} catch (e) {
			console.warn("Fish game: localStorage unavailable", e);
		}

		let data = null;
		if (raw) {
			try {
				data = JSON.parse(raw);
			} catch (e) {
				console.warn("Fish game: save data was corrupted, starting fresh", e);
			}
		}

		if (data) {
			Game.currentFish = data.currentFish || 0;
			Game.fishAllTime = data.fishAllTime || 0;

			for (const saved of data.upgrades || []) {
				const upgrade = Game.upgradesById[saved.id];
				if (upgrade) upgrade.purchased = saved.purchased;
			}

			for (const saved of data.buildings || []) {
				const building = Game.buildingsById[saved.id];
				if (building) {
					building.owned = saved.owned || 0;
					building.rateMult = saved.rateMult || 1;
				}
			}
		}
		if (data && data.env) {
			Game.weather.current = data.env.weatherCurrent || "clear";
			Game.weather.target = data.env.weatherTarget || null;
			Game.weather.blend = data.env.weatherBlend ?? 1;
			Game.weatherNextCheck = data.env.weatherNextCheck || null;
			Game.weatherChance = data.env.weatherChance || Game.baseWeatherChance;
			Game.dayNight.progress = data.env.dayNightProgress ?? 0;

			var special = data.env.specialWeather;
			if (special) {
				Game.specialWeather.active = special.active || null;
				Game.specialWeather.duration = special.duration || 0;
				Game.specialWeather.elapsed = special.elapsed || 0;
			}
		}

		Game.checkOceanEvent();
		Game.updateSkyBody();
		Game.syncUpgradeStatModifiers();
		Game.recalcGains();
		Game.updateFishDisplay();
		Game.refreshPanel("upgrade");
		Game.refreshPanel("building");

		const elapsed = data?.lastSaveTime ? (Date.now() - data.lastSaveTime) / 1000 : 0;
		Game.lastSaveTime = data?.lastSaveTime || Date.now();
		Game.applyOfflineProgress(elapsed);
	},

	applyOfflineProgress: function(elapsedSeconds) {
		if (!elapsedSeconds || elapsedSeconds < 5) return; // ignore tiny gaps (alt-tab for a second, etc)
		if (Game.fishPerSecond <= 0) return;
		const wasCapped = elapsedSeconds > Game.maxOfflineSeconds;
		const cappedSeconds = Math.min(elapsedSeconds, Game.maxOfflineSeconds);
		const gained = Game.fishPerSecond * cappedSeconds * Game.offlineEfficiency;

		if (gained > 0) {
			Game.gainFish(gained);
			Game.showOfflinePopup(gained, cappedSeconds, wasCapped);
		}
	},
	showOfflinePopup: function(gained, seconds, wasCapped) {
		const mins = Math.floor(seconds / 60);
		const timeStr = mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
		const message =
			`Welcome back! You earned ${Math.floor(gained)} fish over ${timeStr}${wasCapped ? " (capped)" : ""}.`;

		const popup = getEle("offlinePopup");
		const text = getEle("offlinePopupText");

		if (popup && text) {
			text.textContent = message;
			popup.classList.add("open");
		} else {
			console.log(message); // fallback until the popup div exists
		}
	},

	// "GAME SAVED" TOAST
	ensureSaveToast: function() {
		if (Game.saveToastEl) return Game.saveToastEl;
		//console.log("Save toast")
		const toast = document.createElement("div");
		toast.id = "saveToast";
		toast.textContent = "Game saved";
		Object.assign(toast.style, {
			position: "fixed",
			bottom: "16px",
			left: "16px",
			padding: "8px 14px",
			background: "rgba(20, 30, 40, 0.85)",
			color: "#fff",
			fontFamily: "monospace",
			fontSize: "13px",
			borderRadius: "6px",
			opacity: "0",
			transform: "translateY(8px)",
			transition: "opacity 0.25s ease, transform 0.25s ease",
			pointerEvents: "none",
			zIndex: "9999"
		});

		document.body.appendChild(toast);
		Game.saveToastEl = toast;
		return toast;
	},
	showSaveToast: function() {
		const toast = Game.ensureSaveToast();
		clearTimeout(Game.saveToastTimeout);

		toast.style.opacity = "1";
		toast.style.transform = "translateY(0)";

		Game.saveToastTimeout = setTimeout(() => {
			toast.style.opacity = "0";
			toast.style.transform = "translateY(8px)";
		}, 1500);
	},
    resetGame: function(hardReset = false) {
        if (hardReset) {
            localStorage.removeItem(Game.SAVE_KEY);
			Game.fishAllTime = 0;
        }
        Game.currentFish = 0;
        Game.lastSaveTime = Date.now();

        for (const upgrade of Game.upgrades) {
            upgrade.purchased = false;
        }

        for (const building of Game.buildings) {
            building.owned = 0;
            building.rateMult = 1;
        }

        for (const fish of Game.allFish) {
            fish.unlocked = false;
        }
		// Clear Weather

        Game.specialWeather.active = null;
        Game.specialWeather.duration = 0;
        Game.specialWeather.elapsed = 0;

        Game.weather.current = "clear";
        Game.weather.target = null;
        Game.weather.blend = 1;
        Game.weatherNextCheck = null;
        Game.weatherChance = Game.baseWeatherChance;

        Game.dayNight.progress = 0;

        Game.syncUpgradeStatModifiers();
        Game.recalcGains();
        Game.updateFishDisplay();
        Game.showFips();
		Game.refreshPanel("cultist");
        Game.refreshPanel("upgrade");
        Game.refreshPanel("building");
        Game.fishDirty = true;

		// Clear Fish
		
    },
    // Achievements 

    achievements: [],
    achievementsById: {},
    addAchievement: function(data) {
        Game.achievements.push(data);
        Game.achievementsById[data.id] = data;
    },
    checkAchievements: function() {
        for (const ach of Game.achievements) {
            if (ach.unlocked) continue;
            if (ach.check(Game)) {
                ach.unlocked = true;
                Game.showAchievementPopup(ach);
                console.log("Achievement unlocked:", ach.name);
            }
        }
    },
    showAchievementPopup: function(ach) {
        const popup = getEle("achievementPopup");
        const text = getEle("achievementPopupText");

        if (popup && text) {
            text.textContent = `Achievement Unlocked: ${ach.name} - ${ach.desc}`;
            popup.classList.add("open");
            setTimeout(() => {
                popup.classList.remove("open");
            }, 3000);
        } else {
            console.log(`Achievement Unlocked: ${ach.name} - ${ach.desc}`);
        }
    },
    // ACTIVE BUFF DISPLAY (day/night + special weather bonuses from applyEnvironmentalStats)
	buffDisplayEl: null,
	ensureBuffDisplay: function() {
		if (Game.buffDisplayEl) return Game.buffDisplayEl;
 
		const el = document.createElement("div");
		el.id = "activeBuffs";
		Object.assign(el.style, {
			display: "flex",
			flexDirection: "column",
			alignItems: "flex-end",
			gap: "4px",
			fontFamily: "monospace",
			fontSize: "12px",
			zIndex: "999",
			pointerEvents: "none"
		});
        var text = getEle('text');
        if (text) text.appendChild(el);
        else document.body.appendChild(el);
		Game.buffDisplayEl = el;
		return el;
	},
	lastRenderedBuffIds: "",
	updateBuffDisplay: function() {
		const idKey = Game.activeBuffs.map(b => b.id).join(",");
		if (idKey === Game.lastRenderedBuffIds) {
			const el = Game.buffDisplayEl;
			if (el) {
				const tags = el.querySelectorAll(".buffTag");
				Game.activeBuffs.forEach((buff, i) => {
					if (tags[i]) tags[i].textContent = buff.label;
				});
			}
			return;
		}
 
		const el = Game.ensureBuffDisplay();
		el.innerHTML = "";
		for (const buff of Game.activeBuffs) {
			const tag = document.createElement("div");
			tag.className = "buffTag";
			tag.textContent = buff.label;
			Object.assign(tag.style, {
				background: "rgba(20, 30, 40, 0.8)",
				color: "#fff",
				padding: "4px 10px",
				borderRadius: "12px",
				whiteSpace: "nowrap"
			});
			el.appendChild(tag);
		}
		Game.lastRenderedBuffIds = idKey;
	}
};

const swimDrift = function(fish, dt) {
	fish.velocityX = fish.direction * fish.speed;
	fish.velocityY = Math.sin(
		Game.time * 0.8 + fish.phase
	) * 5;
}
/////////////////////////
//FISH DEFS 
Game.addAchievement({
    id: "ach_fisherman",
    name: "Fisherman",
    desc: "Catch 100 fish.",
    check: function(game) {
        return game.fishAllTime >= 100;
    },
    unlocked: false,
    icon: {
        sheet: "flo_icons_ui",
        col: 0,
        row: 0
    }
});
Game.addFish({
	fid: "flo_anglerfish",
	name: "Anglerfish",
	row: 2,
	column: 0,
	unlocked: false,
	yPref: 300,
	yRange: 100,
	swimStates: ["drift", "lurk"],
	swimPattern: function(fish, dt) {
		fish.velocityX = fish.direction * fish.speed;
		fish.velocityY = Math.sin(
			Game.time * 0.1 + fish.phase
		) * 0.95;
	},
	speedBase: 10,
	speedRange: 10,
});
Game.addFish({
	fid: "flo_largemouth_bass",
	name: "Largemouth Bass",
	row: 2,
	column: 1,
	unlocked: false,
	yPref: 100,
	yRange: 300,
	swimStates: ["drift", "lurk"],
	swimPattern: swimDrift,
	speedBase: 10,
	speedRange: 10,
});

Game.addFish({
	fid: "flo_spotted_moray",
	name: "Spotted Moray Eel",
	row: 2,
	column: 2,
	unlocked: false,
	yPref: 100,
	yRange: 200,
	swimStates: ["drift", "lurk"],
	swimPattern: function(fish, dt) {
		fish.velocityX = fish.direction * fish.speed + Math.sin(Game.time * 0.5 + fish.phase);
		fish.velocityY = Math.sin(
			Game.time * 0.4 + fish.phase
		) * 10;
	},
	speedBase: 10,
	speedRange: 10,
});

Game.addFish({
	fid: "flo_sunfish",
	name: "Sunfish",
	row: 2,
	column: 3,
	unlocked: false,
	yPref: 100,
	yRange: 200,
	swimStates: ["drift", "lurk"],
	swimPattern: function(fish, dt) {
		fish.velocityX = fish.direction * fish.speed
		fish.velocityY = Math.sin(
			Game.time * 0.1 + fish.phase
		) * 0.5;
	},
	speedBase: 10,
	speedRange: 10,
});

Game.addFish({
	fid: "flo_octopus",
	name: "Octopus",
	row: 4,
	column: 9,
	unlocked: false,
	yPref: 100,
	yRange: 200,
	swimStates: ["drift", "lurk"],
	swimPattern: function(fish, dt) {
		fish.velocityX = fish.direction * fish.speed + Math.sin(
			Game.time * 0.1);
		fish.velocityY = Math.sin(
			Game.time * 1.1 + fish.phase
		) * 10;
	},
	speedBase: 5,
	speedRange: 5,
});

Game.addFish({
	fid: "flo_cod",
	name: "Cod",
	row: 2,
	column: 9,

	unlocked: true,

	yPref: 100, //where 0 is surface
	yRange: 400,
	swimStates: ["drift", "lurk"],

	swimPattern: swimDrift,
	speedBase: 15,
	speedRange: 25,
});

Game.addFish({
	fid: "flo_seahorse",
	name: "Seahorse",
	row: 6,
	column: 0,

	unlocked: false,

	yPref: 300, //where 0 is surface
	yRange: 200,
	swimStates: ["drift", "lurk"],

	swimPattern: function(fish, dt) {
		fish.velocityX = fish.direction * fish.speed;
		fish.velocityY = Math.sin(
			Game.time * 1.5 + fish.phase
		) * 5;
	},
	speedBase: 10,
	speedRange: 5,
});

Game.addFish({
	fid: "flo_lionfish",
	name: "Lionfish",
	row: 5,
	column: 5,

	unlocked: false,

	yPref: 100, //where 0 is surface
	yRange: 100,
	swimStates: ["drift", "lurk"],

	swimPattern: function(fish, dt) {
		fish.velocityX = fish.direction * fish.speed;
		fish.velocityY = Math.sin(
			Game.time * 0.5 + fish.phase
		) * 5;
	},
	speedBase: 10,
	speedRange: 5,
});

// BUILDINGS
Game.addBuilding({
	id: "net",
	name: "Fishing Net",
	desc: "Passively catches fish over time.",
	baseRate: 0.1,
	baseCost: 25,
	costScale: 1.15,
	requires: [],
	icon: {
		sheet: "flo_icons_ui",
		col: 2,
		row: 0
	},
	owned: 0,
	onBuy: function(b) {
		/* hook into a passive income tick later */
	}
});
Game.addBuilding({
	id: "grandpa",
	name: "Grandpas",
	desc: "Grandpas with nothing better to do than help you fish.",
	baseRate: 1,
	baseCost: 250,
	costScale: 1.15,
	requires: [],
	icon: {
		sheet: "flo_icons_ui",
		col: 2,
		row: 0
	},
	owned: 0,
	onBuy: function(b) {
		/* hook into a passive income tick later */
	}
});
Game.addBuilding({
	id: "pier",
	name: "Pier",
	desc: "A pier for your Grandpas to sit on.",
	baseRate: 15,
	baseCost: 2500,
	costScale: 1.15,
	requires: [],
	icon: {
		sheet: "flo_icons_ui",
		col: 2,
		row: 0
	},
	owned: 0,
	onBuy: function(b) {
		/* hook into a passive income tick later */
	}
});



// UPGRADE DEFS

/////////////////////////////////
// TODO: TIERED UPGRADES
///////////////////////////////////////

Game.addUpgrade({
	id: "netUpgrade1",
	name: "New Bobber!",
	desc: "Catch 2 fish per click instead of 1.",
	cost: 25,
	requires: [],
	icon: {
		sheet: "flo_icons_ui",
		col: 0,
		row: 0
	},
	purchased: false,
	effects: {
		fishPerClick: 1
	} 
});
Game.addUpgrade({
	id: "netUpgrade2",
	name: "Better Bobber",
	desc: "Catch 3 fish per click instead of 2.",
	cost: 100,
	requires: ["netUpgrade1"], 
	icon: {
		sheet: "flo_icons_ui",
		col: 1,
		row: 0
	},
	purchased: false,
	effects: {
		fishPerClick: 1
	}
});

Game.addUpgrade({
	id: "nightPower1",
	name: "Night Owl",
	desc: "+2% Fish Per Click while it's Nighttime.",
	cost: 3, // CHANGE
	requires: ["netUpgrade1"],
	icon: {
		sheet: "flo_icons_ui",
		col: 4,
		row: 1
	},
	purchased: false,
	effects: {
		nightPower: 0.02
	}
});
Game.addUpgrade({
	id: "dayPower1",
	name: "Daylight Dancer",
	desc: "+2% Fish Per Second while it's Daytime.",
	cost: 3, // CHANGE
	requires: ["netUpgrade1"],
	icon: {
		sheet: "flo_icons_ui",
		col: 4,
		row: 1
	},
	purchased: false,
	effects: {
		dayPower: 0.02
	}
});

Game.addUpgrade({
	id: "seahorse",
	name: "Poseidon's Races",
	desc: "+5% Fish Per Second! Also unlocks seahorses",
	cost: 150,
	requires: ["netUpgrade1"],
	icon: {
		sheet: "flo_icons_ui",
		col: 0,
		row: 6
	},
	purchased: false,
	effects: {
		fishPerSecMult: 0.05
	},
	onBuy: function() {
		Game.allFishById["flo_seahorse"].unlocked = true;
	} 
});
Game.addUpgrade({
	id: "cultistFavor",
	name: "Cultist's Blessing",
	desc: "???",
	cost: 20,
	requires: ["netUpgrade1"],
	icon: {
		sheet: "flo_icons_ui",
		col: 9,
		row: 0
	},
	purchased: false,
	effects: {},
	onBuy: function() {
		//console.log("woo woo")
		var cultToggle = getEle('cultistToggle');
		cultToggle.style.display = 'block';
	}
});

// OCEAN EVENTS 
Game.addOceanEvent({
	id: "planktonBloom",
	name: "Plankton Bloom",
	dateDigits: [1, 2],
	desc: "The water's thick with plankton today.",
	waterTint: "#ff9ecb",
	tintStrength: 0.8 // how strongly it mixes into the base water color, 0-1
});

console.clear();
console.log("=========================");
console.log("WELCOME TO FISH FISH FISH");
console.log("=========================");

Game.boot();
