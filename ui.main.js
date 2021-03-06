var Cards, CardCodes, Targeting, targetingMode, targetingModeCb, targetingText, game, discarding, animCb, user, renderer, endturnFunc, cancelFunc, accepthandfunc, foeDeck, player2summon, player2Card, guestname;
(function(g) {
	var htmlElements = ["leftpane", "chatArea", "chatinput", "deckimport", "aideck", "foename", "airefresh", "change", "login", "password", "challenge", "aievalopt", "chatBox", "trade", "bottompane", "demigodmode"];
	for (var i = 0;i < htmlElements.length;i++) {
		g[htmlElements[i]] = document.getElementById(htmlElements[i]);
	}
})(window);
var etg = require("./etgutil");
var MersenneTwister = require("./MersenneTwister");
var myTurn = false;
var cardChosen = false;
loadcards(function(cards, cardcodes, targeting) {
	Cards = cards;
	CardCodes = cardcodes;
	Targeting = targeting;
	console.log("Cards loaded");
});
function getTarget(src, active, cb) {
	var targetingFilter = Targeting[active.activename];
	if (targetingFilter) {
		targetingMode = function(t) { return (t instanceof Player || t instanceof CardInstance || t.owner == game.turn || t.passives.cloak || !t.owner.isCloaked()) && targetingFilter(src, t); }
		targetingModeCb = cb;
		targetingText = active.activename;
	} else {
		cb();
	}
}
function maybeSetText(obj, text) {
	if (obj.text != text) obj.setText(text);
}
function maybeSetTexture(obj, text) {
	if (text) {
		obj.visible = true;
		obj.setTexture(text);
	} else obj.visible = false;
}
function maybeSetButton(oldbutton, newbutton) {
	if (oldbutton)
		oldbutton.visible = false;
	if (newbutton)
		newbutton.visible = true;
}
function reflectPos(obj) {
	var pos = obj instanceof PIXI.Point ? obj : obj.position;
	pos.set(900 - pos.x, 600 - pos.y);
}
function hitTest(obj, pos) {
	var x = obj.position.x - obj.width * obj.anchor.x, y = obj.position.y - obj.height * obj.anchor.y;
	return pos.x > x && pos.y > y && pos.x < x + obj.width && pos.y < y + obj.height;
}
function setInteractive() {
	for (var i = 0;i < arguments.length;i++) {
		arguments[i].interactive = true;
	}
}
function userEmit(x, data) {
	if (!data) data = {};
	data.u = user.name;
	data.a = user.auth;
	socket.emit(x, data);
}
function tgtToBits(x) {
	var bits;
	if (x == undefined) {
		return 0;
	} else if (x instanceof Player) {
		bits = 1;
	} else if (x instanceof Weapon) {
		bits = 17;
	} else if (x instanceof Shield) {
		bits = 33;
	} else {
		bits = (x instanceof Creature ? 2 : x instanceof Permanent ? 4 : 5) | x.getIndex() << 4;
	}
	if (x.owner == game.player2) {
		bits |= 8;
	}
	return bits;
}
function bitsToTgt(x) {
	var tgtop = x & 7, player = game.players[x & 8 ? 0 : 1];
	if (tgtop == 0) {
		return undefined;
	} else if (tgtop == 1) {
		return player[["owner", "weapon", "shield"][x >> 4]];
	} else if (tgtop == 2) {
		return player.creatures[x >> 4];
	} else if (tgtop == 4) {
		return player.permanents[x >> 4];
	} else if (tgtop == 5) {
		return player.hand[x >> 4];
	} else console.log("Unknown tgtop: " + tgtop + ", " + x);
}
function creaturePos(j, i) {
	var row = i < 8 ? 0 : i < 15 ? 1 : 2;
	var column = row == 2 ? (i+1) % 8 : i % 8;
	var p = new PIXI.Point( 151 + column * 79 + (row == 1 ? 79/2 : 0), 344 + row * 33);
	if (j) {
		reflectPos(p);
	}
	return p;
}
function permanentPos(j, i) {
	var p = new PIXI.Point(140 + (i % 8) * 64  , 504 + Math.floor(i / 8) * 40);
	if (j) {
		reflectPos(p);
	}
	return p;
}
function tgtToPos(t) {
	if (t instanceof Creature) {
		return creaturePos(t.owner == game.player2, t.getIndex());
	} else if (t instanceof Weapon) {
		var p = new PIXI.Point(666, 512);
		if (t.owner == game.player2) reflectPos(p);
		return p;
	} else if (t instanceof Shield) {
		var p = new PIXI.Point(710, 532);
		if (t.owner == game.player2) reflectPos(p);
		return p;
	} else if (t instanceof Permanent) {
		return permanentPos(t.owner == game.player2, t.getIndex());
	} else if (t instanceof Player) {
		var p = new PIXI.Point(50, 560);
		if (t == game.player2) reflectPos(p);
		return p;
	} else if (t instanceof CardInstance) {
		return new PIXI.Point(j ? 20 : 780, (j ? 140 : 300) + 20 * i);
	} else console.log("Unknown target");
}
function refreshRenderer() {
	if (renderer) {
		leftpane.removeChild(renderer.view);
	}
	renderer = new PIXI.CanvasRenderer(900, 600);
	leftpane.appendChild(renderer.view);
}

var mainStage, menuui, gameui;
var caimgcache = {}, crimgcache = {}, primgcache = {}, artcache = {}, artimagecache = {};
var elecols = [0xa99683, 0xaa5999, 0x777777, 0x996633, 0x5f4930, 0x50a005, 0xcc6611, 0x205080, 0xa9a9a9, 0x337ddd, 0xccaa22, 0x333333, 0x77bbdd];

function lighten(c) {
	return (c & 255) / 2 + 127 | ((c >> 8) & 255) / 2 + 127 << 8 | ((c >> 16) & 255) / 2 + 127 << 16;
}
function getIcon(ele) {
	return eicons ? eicons[ele] : nopic;
}
function getBack(ele, upped) {
	var offset = upped ? 13 : 0;
	return cardBacks ? cardBacks[ele + offset] : nopic;
}
function getRareIcon(rarity) {
	return rarityicons ? rarityicons[rarity] : nopic;
}
function makeArt(card, art) {
	var rend = new PIXI.RenderTexture(132, 256);
	var background = new PIXI.Sprite(getBack(card.element, card.upped));
	var rarity = new PIXI.Sprite(getRareIcon(card.rarity));
	var template = new PIXI.Graphics();
	background.position.set(0, 0);
	template.addChild(background);
	rarity.position.set(66, 241);
	template.addChild(rarity);
	if (art) {
		var artspr = new PIXI.Sprite(art);
		artspr.position.set(2, 20);
		template.addChild(artspr);
	}
	var nametag = new PIXI.Text(card.name, { font: "12px Dosis", fill: card.upped ? "black" : "white" });
	nametag.position.set(2, 4);
	template.addChild(nametag);
	if (card.cost) {
		var text = new PIXI.Text(card.cost, { font: "12px Dosis", fill: card.upped ? "black" : "white" });
		text.anchor.x = 1;
		text.position.set(rend.width - 20, 4);
		template.addChild(text);
		if (card.costele) {
			var eleicon = new PIXI.Sprite(getIcon(card.costele));
			eleicon.position.set(rend.width - 1, 10);
			eleicon.anchor.set(1, .5);
			eleicon.scale.set(.5, .5);
			template.addChild(eleicon);
		}
	}
	var words = card.info().split(" ");
	var x = 2, y = 150;
	for (var i = 0;i < words.length;i++) {
		var wordgfx = new PIXI.Sprite(getTextImage(words[i], 11, card.upped ? "black" : "white"));
		if (x + wordgfx.width > rend.width - 2) {
			x = 2;
			y += 12;
		}
		wordgfx.position.set(x, y);
		x += wordgfx.width + 3;
		template.addChild(wordgfx);
	}
	rend.render(template);
	return rend;
}
function getArt(code) {
	if (artcache[code]) return artcache[code];
	else {
		var loader = new PIXI.AssetLoader(["Cards/" + code + ".png"]);
		loader.onComplete = function() {
			var cardArt = PIXI.Texture.fromImage("Cards/" + code + ".png")
			artcache[code] = makeArt(CardCodes[code], cardArt);
			artimagecache[code] = cardArt;
		}
		artcache[code] = makeArt(CardCodes[code]);
		loader.load();
		return artcache[code];
	}
}
function getArtImage(code){
	if (artimagecache[code]) return artimagecache[code];
	else {
		var loader = new PIXI.AssetLoader(["Cards/" + code + ".png"]);
		loader.onComplete = function() {
			artimagecache[code] = PIXI.Texture.fromImage("Cards/" + code + ".png");
		}
		artimagecache[code] = null;
		loader.load();
		return artimagecache[code];
	}
}
function getCardImage(code) {
	if (caimgcache[code]) return caimgcache[code];
	else {
		var card = CardCodes[code];
		var rend = new PIXI.RenderTexture(100, 20);
		var graphics = new PIXI.Graphics();
		graphics.lineStyle(2, 0x222222, 1);
		graphics.beginFill(card ? (card.upped ? lighten(elecols[card.element]) : elecols[card.element]) : code == "0" ? 0x887766 : 0x111111);
		graphics.drawRect(0, 0, 100, 20);
		graphics.endFill();
		if (card) {
			var clipwidth = 2;
			if (card.cost) {
				var text = new PIXI.Text(card.cost, { font: "11px Dosis", fill: card.upped ? "black" : "white" });
				text.anchor.x = 1;
				text.position.set(rend.width - 20, 5);
				graphics.addChild(text);
				clipwidth += text.width + 22;
				if (card.costele) {
					var eleicon = new PIXI.Sprite(getIcon(card.costele));
					eleicon.position.set(rend.width - 1, 10);
					eleicon.anchor.set(1, .5);
					eleicon.scale.set(.5, .5);
					graphics.addChild(eleicon);
				}
			}
			var text, loopi = 0;
			do text = new PIXI.Text(card.name.substring(0, card.name.length - (loopi++)), { font: "11px Dosis", fill: card.upped ? "black" : "white" }); while (text.width > rend.width - clipwidth);
			text.position.set(2, 5);
			graphics.addChild(text);
		}
		rend.render(graphics);
		return eicons ? (caimgcache[code] = rend) : rend;
	}
}
//Yes, this code and the namings of the caches are starting to get weird...
var crimgartcache = {};
function getCreatureImage(code) {
	if (crimgcache[code] && crimgartcache[crimgcache[code]]) return crimgcache[code];
	else {
		var card = CardCodes[code];
		var rend = new PIXI.RenderTexture(64, 82);
		var graphics = new PIXI.Graphics();
		var border = (new PIXI.Sprite(cardBorders[card.element + (card.upped ? 13 : 0)]));
		border.scale.set(0.5, 0.5);
		graphics.addChild(border);
		graphics.beginFill(card ? (card.upped ? lighten(elecols[card.element]) : elecols[card.element]) : elecols[0]);
		graphics.drawRect(0, 9, 64, 64);
		graphics.endFill();
		var art = getArtImage(code);
		if (art) {
			art = new PIXI.Sprite(art);
			art.scale.set(0.5, 0.5);
			art.position.set(0, 9);
			graphics.addChild(art);
		}
		if (card) {
			var boxGraphics = new PIXI.Graphics();
			boxGraphics.beginFill(card ? (card.upped ? lighten(elecols[card.element]) : elecols[card.element]) : elecols[0]);
			boxGraphics.drawRect(0, 9, 17, 12);
			boxGraphics.endFill();
			graphics.addChild(boxGraphics);
			var text = new PIXI.Text(CardCodes[code].name, { font: "8px Dosis", fill: card.upped ? "black" : "white" });
			text.anchor.set(0.5, 0.5);
			text.position.set(33, 77);
			graphics.addChild(text);
		}
		rend.render(graphics);
		crimgcache[code] = rend;
		crimgartcache[rend] = art;
		return rend;
	}
}
var primgartcache = {};
function getPermanentImage(code) {
	if (primgcache[code] && primgartcache[primgcache[code]]) return primgcache[code];
	else {
		var card = CardCodes[code];
		var rend = new PIXI.RenderTexture(64, 82);
		var graphics = new PIXI.Graphics();
		var border = (new PIXI.Sprite(cardBorders[card.element + (card.upped ? 13 : 0)]));
		border.scale.set(0.5, 0.5);
		graphics.addChild(border);
		graphics.beginFill(card ? (card.upped ? lighten(elecols[card.element]) : elecols[card.element]) : elecols[0]);
		graphics.drawRect(0, 9, 64, 64);
		graphics.endFill();
		var art = getArtImage(code);
		if (art) {
			art = new PIXI.Sprite(art);
			art.scale.set(0.5, 0.5);
			art.position.set(0, 9);
			graphics.addChild(art);
		}
		if (card) {
			var text = new PIXI.Text(CardCodes[code].name, { font: "8px Dosis", fill: card.upped ? "black" : "white" });
			text.anchor.set(0.5, 0.5);
			text.position.set(33, 77);
			graphics.addChild(text);
		}
		rend.render(graphics);
		primgcache[code] = rend;
		primgartcache[rend] = art;
		return rend;
	}
}
function getWeaponShieldImage(code) {
	if (primgcache[code] && primgartcache[primgcache[code]]) return primgcache[code];
	else {
		var card = CardCodes[code];
		var rend = new PIXI.RenderTexture(80, 102);
		var graphics = new PIXI.Graphics();
		var border = (new PIXI.Sprite(cardBorders[card.element + (card.upped ? 13 : 0)]));
		border.scale.set(5/8, 5/8);
		graphics.addChild(border);
		graphics.beginFill(card ? (card.upped ? lighten(elecols[card.element]) : elecols[card.element]) : elecols[0]);
		graphics.drawRect(0, 11, 80, 80);
		graphics.endFill();
		var art = getArtImage(code);
		if (art) {
			art = new PIXI.Sprite(art);
			art.scale.set(5/8, 5/8);
			art.position.set(0, 11);
			graphics.addChild(art);
		}
		if (card) {
			var text = new PIXI.Text(CardCodes[code].name, { font: "10px Dosis", fill: card.upped ? "black" : "white" });
			text.anchor.set(0.5, 0.5);
			text.position.set(40, 95);
			graphics.addChild(text);
		}
		rend.render(graphics);
		primgcache[code] = rend;
		primgartcache[rend] = art;
		return rend;
	}
}
function initTrade(data) {
	function isFreeCard(card) {
		return card.type == PillarEnum && !card.upped && !card.rarity;
	}
	player2Card = null;
	cardChosen = false;
	if (data.first) myTurn = true;
	var editorui = new PIXI.Stage(0x336699, true), tradeelement = 0;
	var btrade = new PIXI.Text("Trade", { font: "16px Dosis" });
	var bconfirm = new PIXI.Text("Confirm trade", { font: "16px Dosis" });
	var bconfirmed = new PIXI.Text("Confirmed!", { font: "16px Dosis" });
	var bcancel = new PIXI.Text("Cancel Trade", { font: "16px Dosis" });
	var editorcolumns = [];
	var selectedCard;
	var cardartcode;
	bcancel.position.set(10, 10);
	bcancel.click = function() {
		userEmit("canceltrade");
		startMenu();
	}
	btrade.position.set(100, 100);
	btrade.click = function() {
		if (myTurn) {
			if (selectedCard) {
				userEmit("cardchosen", { card: selectedCard })
				console.log("Card sent")
				myTurn = false;
				cardChosen = true;
				editorui.removeChild(btrade);
				editorui.addChild(bconfirm);
			}
			else
				chatArea.value = "You have to choose a card!"
		}
		else
			chatArea.value = "You need to wait for your friend to choose a card first";
	}
	bconfirm.position.set(100, 150);
	bconfirm.click = function() {
		if (player2Card) {
			console.log("Confirmed!");
			myTurn = false;
			userEmit("confirmtrade", { card: selectedCard, oppcard: player2Card });
			editorui.removeChild(bconfirm);
			editorui.addChild(bconfirmed);
		}
		else
			chatArea.value = "Wait for your friend to choose a card!"
	}
	bconfirmed.position.set(100, 180);
	setInteractive(btrade, bconfirm, bcancel);
	editorui.addChild(btrade);
	editorui.addChild(bcancel);


	var cardpool = {};
	for (var i = 0;i < user.pool.length;i++) {
		if (user.pool[i] in cardpool) {
			cardpool[user.pool[i]]++;
		} else {
			cardpool[user.pool[i]] = 1;
		}
	}

	var editoreleicons = [];
	for (var i = 0;i < 13;i++) {
		var sprite = new PIXI.Sprite(nopic);
		sprite.position.set(8, 184 + i * 32);
		setInteractive(sprite);
		(function(_i) {
			sprite.click = function() { tradeelement = _i; }
		})(i);
		editoreleicons.push(sprite);
		editorui.addChild(sprite);
	}
	function adjustRarity(card) {
		var rarity = card.rarity;
		if (card.upped) {
			if (rarity == 1)
				rarity = 2;
			else if (rarity == 3)
				rarity = 4;
			else
				rarity += 6
		}
		return rarity;
	}
	for (var i = 0;i < 6;i++) {
		editorcolumns.push([[], []]);
		for (var j = 0;j < 15;j++) {
			var sprite = new PIXI.Sprite(nopic);
			sprite.position.set(100 + i * 130, 272 + j * 20);
			var sprcount = new PIXI.Text("", { font: "12px Dosis" });
			sprcount.position.set(102, 4);
			sprite.addChild(sprcount);
			(function(_i, _j) {
				sprite.click = function() {
					if (player2Card && adjustRarity(CardCodes[player2Card]) != adjustRarity(CardCodes[cardartcode])) chatArea.value = "You can only trade cards with the same rarity";
					else if (cardChosen) chatArea.value = "You have already selected a card";
					else if (!myTurn) chatArea.value = "You need to wait for your friend to choose a card first";
					else if (isFreeCard(CardCodes[cardartcode])) chatArea.value = "You can't trade a free card, that would just be cheating!";
					else selectedCard = cardartcode;
				}
				sprite.mouseover = function() {
					cardartcode = editorcolumns[_i][1][tradeelement][_j];
				}
			})(i, j);
			sprite.interactive = true;
			editorui.addChild(sprite);
			editorcolumns[i][0].push(sprite);
		}
		for (var j = 0;j < 13;j++) {
			editorcolumns[i][1].push(filtercards(i > 2,
                function(x) { return x.element == j && ((i % 3 == 0 && x.type == CreatureEnum) || (i % 3 == 1 && x.type <= PermanentEnum) || (i % 3 == 2 && x.type == SpellEnum)); },
                editorCardCmp));
		}
	}
	var cardArt = new PIXI.Sprite(nopic);
	cardArt.position.set(734, 8);
	editorui.addChild(cardArt);
	var selectedCardArt = new PIXI.Sprite(nopic);
	selectedCardArt.position.set(334, 8);
	editorui.addChild(selectedCardArt);
	var player2CardArt = new PIXI.Sprite(nopic);
	player2CardArt.position.set(534, 8);
	editorui.addChild(player2CardArt);
	animCb = function() {
		if (cardartcode) {
			cardArt.setTexture(getArt(cardartcode));
		}
		if (selectedCard) {
			selectedCardArt.setTexture(getArt(selectedCard));
		}
		if (player2Card) {
			player2CardArt.setTexture(getArt(player2Card));
		}
		for (var i = 0;i < 13;i++) {
			editoreleicons[i].setTexture(getIcon(i));
		}
		for (var i = 0;i < 6;i++) {
			for (var j = 0;j < editorcolumns[i][1][tradeelement].length;j++) {
				var spr = editorcolumns[i][0][j], code = editorcolumns[i][1][tradeelement][j], card = CardCodes[code];
				if (card in cardpool || isFreeCard(card)) spr.visible = true;
				else spr.visible = false;
				spr.setTexture(getCardImage(code));
				var txt = spr.getChildAt(0), card = CardCodes[code], inf = isFreeCard(card);
				if ((txt.visible = inf || code in cardpool)) {
					maybeSetText(txt, inf ? "-" : (cardpool[code].toString()));
				}
			}
			for (;j < 15;j++) {
				editorcolumns[i][0][j].visible = false;
			}
		}
	}
	mainStage = editorui;
	refreshRenderer();
}
function initGame(data, ai) {
	game = mkGame(data.first, data.seed);
	if (data.hp) {
		game.player2.maxhp = game.player2.hp = data.hp;
	}
	if (data.aimarkpower) {
		game.player2.markpower = data.aimarkpower;
	}
	if (data.urhp) {
		game.player1.maxhp = game.player1.hp = data.urhp
	if (data.aidrawpower) {
	    game.player2.drawpower = data.aidrawpower;
	}
	if (data.demigod) {
	    game.player1.maxhp = game.player1.hp = 200;
	    game.player1.drawpower = 2;
	    data.urdeck = doubleDeck(data.urdeck);
	    game.player1.markpower = 3;
	}
	if (data.foedemigod) {
	    game.player2.maxhp = game.player2.hp = 200;
	    game.player2.drawpower = 2;
	    data.deck = doubleDeck(data.deck);
	    game.player2.markpower = 3;
	}
	var idx, code, decks = [data.urdeck, data.deck];
	for (var j = 0;j < 2;j++) {
		for (var i = 0;i < decks[j].length;i++) {
			if (CardCodes[code = decks[j][i]]) {
				game.players[j].deck.push(CardCodes[code]);
			} else if (~(idx = TrueMarks.indexOf(code))) {
				game.players[j].mark = idx;
			}
		}
	}
	foeDeck = game.player2.deck.slice();
	if (game.turn == game.player1) {
		game.player1.drawhand(7);
		game.player2.drawhand(7);
	} else {
		game.player2.drawhand(7);
		game.player1.drawhand(7);
	}
	if (data.foename) game.foename = data.foename;
	startMatch();
	if (ai) {
		game.player2.ai = ai;
		if (game.turn == game.player2) {
			progressMulligan(game);
		}
	}
}
function getDeck() {
    if (user) {
		return user.decks[user.selectedDeck] || [];
	}
	var deckstring = deckimport.value;
	return deckstring ? deckstring.split(" ") : [];
}
var aiDelay = 0;
function aiEvalFunc() {
	var gameBack = game;
	var disableEffectsBack = disableEffects;
	game = cloneGame(game);
	disableEffects = true;
	var self = game.player2;
	function mkcommand(cbits, tbits) {
		return ["cast", cbits | tbits << 9];
	}
	function iterLoop(n, commands, currentEval) {
		function iterCore(c, active) {
			var cbits = tgtToBits(c) ^ 8;
			var candidates = [fullCandidates[0]];
			function evalIter(t, ignoret) {
				if (ignoret || (t && targetingMode(t))) {
					var tbits = tgtToBits(t) ^ 8;
					var gameBack2 = game, targetingModeBack = targetingMode, targetingModeCbBack = targetingModeCb;
					game = cloneGame(game);
					var tone = bitsToTgt(tbits);
					bitsToTgt(cbits).useactive(tone);
					var cmdcopy = commands.slice();
					cmdcopy.push(mkcommand(cbits, tbits));
					var v = evalGameState(game);
					console.log(c + " " + t + " " + v);
					if (v < candidates[0]) {
						candidates = [v, cmdcopy];
					}
					if (n) {
						var iterRet = iterLoop(n - 1, cmdcopy, v);
						if (iterRet[0] < candidates[0]) {
							candidates = iterRet;
						}
					}
					game = gameBack2;
					targetingMode = targetingModeBack;
					targetingModeCb = targetingModeCbBack;
				}
			}
			getTarget(c, active || Actives.obsession, function(t) {
				if (!t) {
					evalIter(undefined, true);
				}
				targetingMode = null;
				console.log(candidates.length + candidates.join(" "));
				if (candidates.length > 1) {
					var v = candidates[0], oldv = fullCandidates[0];
					if (v < oldv) {
						fullCandidates = candidates;
					}
				}
			});
			if (targetingMode) {
				console.log("in " + active.activename);
				for (var j = 0;j < 2;j++) {
					var pl = j == 0 ? c.owner : c.owner.foe;
					console.log("1:" + (pl.game == game));
					evalIter(pl);
					console.log("2:" + (pl.game == game));
					evalIter(pl.weapon);
					evalIter(pl.shield);
					for (var i = 0;i < 23;i++) {
						evalIter(pl.creatures[i]);
					}
					console.log("3:" + (pl.game == game));
					for (var i = 0;i < 16;i++) {
						evalIter(pl.permanents[i]);
					}
					for (var i = 0;i < pl.hand.length;i++) {
						evalIter(pl.hand[i]);
					}
				}
				console.log("out");
				targetingModeCb(1);
			}
		}
		if (currentEval === undefined) {
			currentEval = evalGameState(game);
		}
		console.log("Currently " + currentEval);
		var fullCandidates = [currentEval];
		var self = game.player2;
		var wp = self.weapon, sh = self.shield;
		if (wp && wp.canactive()) {
			iterCore(wp, wp.active.cast);
		}
		if (sh && sh.canactive()) {
			iterCore(sh, sh.active.cast);
		}
		for (var i = 0;i < 23;i++) {
			var cr = self.creatures[i];
			if (cr && cr.canactive()) {
				iterCore(cr, cr.active.cast);
			}
		}
		for (var i = 0;i < 16;i++) {
			var pr = self.permanents[i];
			if (pr && pr.canactive()) {
				iterCore(pr, pr.active.cast);
			}
		}
		var codecache = {};
		for (var i = self.hand.length - 1;i >= 0;i--) {
			var cardinst = self.hand[i];
			if (cardinst.canactive()) {
				if (!(cardinst.card.code in codecache)) {
					codecache[cardinst.card.code] = true;
					iterCore(cardinst, cardinst.card.type == SpellEnum && cardinst.card.active);
				}
			}
		}
		return fullCandidates;
	}
	var cmd = iterLoop(1, [])[1];
	game = gameBack;
	disableEffects = disableEffectsBack;
	if (cmd) {
		return cmd[0];
	} else if (self.hand.length == 8) {
		var mincardvalue = 999, worstcards;
		for (var i = 0;i < 8;i++) {
			var cardinst = self.hand[i];
			var cardvalue = self.quanta[cardinst.card.element] - cardinst.card.cost;
			if (cardinst.card.type != SpellEnum && cardinst.card.active && cardinst.card.active.discard == Actives.obsession) { cardvalue += 5; }
			if (cardvalue == mincardvalue) {
				worstcards.push(i);
			} else if (cardvalue < mincardvalue) {
				mincardvalue = cardvalue;
				worstcards = [i];
			}
		}
		return ["endturn", worstcards[Math.floor(Math.random() * worstcards.length)]];
	} else return ["endturn"];
}

function aiFunc() {
	var self = this;
	function iterCore(c, active) {
		var cmd;
		getTarget(c, active, function(t) {
			targetingMode = null;
			if (!t && !ActivesEval[active.activename](c)) {
				console.log("Hold " + active.activename);
				return;
			}
			cmd = ["cast", (tgtToBits(c) ^ 8) | (tgtToBits(t) ^ 8) << 9];
		});
		if (targetingMode) {
			console.log("in " + active.activename);
			var t = evalPickTarget(c, active, targetingMode);
			console.log("out " + (t ? (t instanceof Player ? "player" : t.card.name) : ""));
			if (t) {
				targetingModeCb(t);
			} else targetingMode = null;
		}
		return cmd;
	}
	var cmd;
	for (var i = 0;i < 23;i++) {
		var cr = self.creatures[i];
		if (cr && cr.canactive()) {
			if (cmd = iterCore(cr, cr.active.cast)) return cmd;
		}
	}
	var wp = self.weapon, sh = self.shield;
	if (wp && wp.canactive()) {
		if (cmd = iterCore(wp, wp.active.cast)) return cmd;
	}
	if (sh && sh.canactive()) {
		if (cmd = iterCore(sh, sh.active.cast)) return cmd;
	}
	for (var i = self.hand.length - 1;i >= 0;i--) {
		var cardinst = self.hand[i];
		if (cardinst.canactive()) {
			if (cardinst.card.type == SpellEnum) {
				if (cmd = iterCore(cardinst, cardinst.card.active)) return cmd;
			} else if (cardinst.card.type == WeaponEnum ? (!self.weapon || self.weapon.card.cost < cardinst.card.cost) :
                cardinst.card.type == ShieldEnum ? (!self.shield || self.shield.card.cost < cardinst.card.cost) : true) {
				return ["cast", tgtToBits(cardinst) ^ 8];
			}
		}
	}
	for (var i = 0;i < 16;i++) {
		var pr = self.permanents[i];
		if (pr && pr.canactive()) {
			if (cmd = iterCore(pr, pr.active.cast)) return cmd;
		}
	}
	if (self.hand.length == 8) {
		var mincardvalue = 999, worstcards;
		for (var i = 0;i < 8;i++) {
			var cardinst = self.hand[i];
			var cardvalue = self.quanta[cardinst.card.element] - cardinst.card.cost;
			if (cardinst.card.type != SpellEnum && cardinst.card.active && cardinst.card.active.discard == Actives.obsession) { cardvalue += 5; }
			if (cardvalue == mincardvalue) {
				worstcards.push(i);
			} else if (cardvalue < mincardvalue) {
				mincardvalue = cardvalue;
				worstcards = [i];
			}
		}
		return ["endturn", worstcards[Math.floor(Math.random() * worstcards.length)]];
	} else return ["endturn"];
}
function victoryScreen(goldreward, cardreward) {
	victoryui = new PIXI.Stage(0x000000, true);

	//lobby background
	var bgvictory = new PIXI.Sprite(backgrounds[0]);
	victoryui.addChild(bgvictory);

	var victoryText = game.quest ? game.wintext : "You have won!";
	var posX = 450;
	var posY = game.cardreward ? 130 : 250;
	tinfo = makeText(posX, posY, victoryText, true);
	tinfo.anchor.x = 0.5;
	var bexit = makeButton(420, 430, 75, 18, buttons.exit);
	bexit.click = function() {
		if (game.cardreward) {
			userEmit("addcard", { c: game.cardreward });
			user.pool.push(game.cardreward);
		}
		if (game.goldreward) {
			userEmit("addgold", { g: game.goldreward });
			user.gold += game.goldreward;
		}
		if (game.quest)
			startQuestWindow();
		else
			startMenu();
		game = undefined;
	}
	if (game.goldreward) {
		var goldshown = game.cost ? (game.goldreward - game.cost) : game.goldreward;
		tgold = makeText(340, 550, "Gold won:      " + goldshown, true);
		var igold = PIXI.Sprite.fromImage("assets/gold.png");
		igold.position.set(420, 550);
		igold.visible = true;
		victoryui.addChild(tgold);
		victoryui.addChild(igold);
	}
	if (game.cardreward) {
		var cardArt = new PIXI.Sprite(getArt(game.cardreward));
		cardArt.position.set(380, 170);
		victoryui.addChild(cardArt);
	}
	victoryui.addChild(tinfo);
	victoryui.addChild(bexit);

	animCb = undefined;

	mainStage = victoryui;
	refreshRenderer();
}

function doubleDeck(deck) {
	return deck.slice(0, deck.length - 2).concat(deck);
}

function deckMorph(deck,MorphFrom,morphTo) {
	var deckout =[];
	for (var i =0; i < deck.length; i++) {
		morphMatchInd = MorphFrom.indexOf(deck[i]);
		if (morphMatchInd > -1) {
			deckout.push(morphTo[morphMatchInd]);
		} else {
			deckout.push(deck[i]);
		}
	}
	return deckout;
}

function deckLimitEnforce(deck,limitList,minList,maxList) {
	var deckout=[];
	var deckcounts=[];
	var minCounts=[];
	var maxCounts=[];
	var count;
	for (var i=0; i < limitList.length; i++) {
		minCounts.push({key: limitList[i],value: minList[i]});
		maxCounts.push({key: limitList[i],value: maxList[i]});
	}
	for (var i=0; i < deck.length; i++) {
		cardStr = deck[i];
		if (!(cardStr in deckCounts)) {
			deckCounts.push(key:cardStr , value: 1);
		}
		else {
			deckCounts[cardStr]=deckCounts[cardStr]+1
		}
	}
	for (var i=0; i < deckCounts.length
}

function mkDemigod() {
	if (user) {
		if (user.gold < 20) {
			chatArea.value = "Requires 20\u00A4";
			return;
		}
		user.gold -= 20;
		userEmit("subgold", { g: 20 });
	}

	var demigodDeck = [
        "7ne 7ne 7ne 7ne 7n9 7n9 7t4 7t4 7t4 7t4 7t4 7t4 7t4 7t4 7t4 7t4 7t4 7t4 7t4 7t4 7t4 7t9 7t9 7t9 7tb 7tb 7ta 7ta 7ta 7td 7td 7td 7td 7t5 7t5 8pr",
        "7an 7an 7an 7an 7ap 7ap 7ap 7ap 7aj 7aj 7gk 7gk 7gk 7gk 7gk 7gk 7gk 7gk 7gk 7gk 7gk 7gk 7gk 7gk 7h4 7h4 7h4 7h4 7h4 7gq 7gq 7gq 7h1 7h1 7h1 7gr 7gr 7gr 7gu 7gu 7gu 7gu 7gu 7gu 8pn",
        "744 744 744 744 744 744 744 744 744 744 744 744 744 744 744 74f 74f 74f 74f 74f 74f 745 745 745 745 745 7k9 7k9 7k9 7k9 7k9 7k9 7jv 7jv 7jv 7jv 7jv 7k7 7k7 7k7 7k1 8pq",
        "6ts 6ts 6ts 6ts 6ts 6ts 6ts 6ts 6ts 6ts 6ve 6ve 6ve 6ve 6ve 6ve 6u2 6u2 6u2 6u2 6u2 6u2 6u1 6u1 6u1 6u1 6u1 6u1 6ud 6ud 6ud 6ud 6u7 6u7 6u7 6u7 7th 7th 7tj 7tj 7tj 7ta 7ta 8pt",
        "718 718 718 718 718 718 71a 71a 71a 71a 71a 7n2 7n2 7n2 7n2 7q0 7q0 7q0 7q0 7q0 7q0 7q0 7q0 7q0 7q0 7q0 7q0 7q0 7q0 7q0 7q0 7q0 7q4 7q4 7q4 7qf 7qf 7qf 7q5 7q5 7q5 7q5 7q5 7q5 7qg 7qg 7qg 7qg 8pk",
        "7ac 7ac 7ac 7ac 7ac 7ac 7ac 7ac 7ac 7ac 7ac 7bu 7bu 7bu 7bu 7bu 7bu 7ae 7ae 7ae 7ae 7ae 7ae 7al 7am 7am 7am 7as 7as 7as 7as 80d 80d 80d 80d 80i 80i 80i 8pu",
        "7ac 7ac 7ac 7ac 7ac 7ac 7ac 7ac 7ac 7ac 7ac 7ac 7bu 7bu 7bu 7bu 7bu 7am 7am 7am 7dm 7dm 7dn 7dn 7do 7do 7n0 7n6 7n6 7n6 7n6 7n3 7n3 7n3 7n3 7n3 7n3 7nb 7n9 7n9 7n9 8pr",
        "7dg 7dg 7dg 7dg 7dg 7dg 7dg 7dg 7dg 7dg 7dg 7dg 7dg 7dg 7dg 7dg 7dg 7e0 7e0 7e0 7e0 7e0 7e0 7dv 7dv 7dv 7dv 7dv 7dv 7n2 7n2 7n2 7n2 7qb 7qb 7qb 7th 7th 7th 7th 7tb 7tb 7tb 7tb 7tb 7tb 7ta 7ta 8pt",
        "710 710 710 710 710 710 710 710 710 710 710 710 710 710 72i 72i 72i 72i 71l 71l 71l 71l 717 717 717 71b 71b 71b 711 711 7t7 7t7 7t7 7t7 7t7 7t7 7t9 7t9 7t9 7ti 7ti 7ti 7ti 7ta 7ta 8pt",
        "778 778 778 778 778 778 778 778 778 778 778 778 778 778 778 778 778 778 778 77g 77g 77g 77g 77g 77g 77q 77q 77h 77h 77h 77h 77h 77b 77b 77b 7q4 7q4 7q4 7ql 7ql 7ql 7ql 7ql 7q3 7q3 8ps"
	];

	var demigodNames = [
        "Atomsk",
        "Thetis",
        "Kenosis",
        "Lycaon",
        "Nirrti",
        "Suwako",
        "Akan",
        "Gobannus",
        "Anubis",
        "Pele"
	];

	var rand = Math.floor(Math.random() * demigodNames.length);
	var dgname = "Demigod\n" + demigodNames[rand];
	var deck = demigodDeck[rand].split(" ");
	deck = doubleDeck(deck);
	var urdeck = getDeck();
	if ((user && (!user.deck || user.deck.length < 31)) || urdeck.length < 11) {
		startEditor();
		return;
	}
	initGame({ first: Math.random() < .5, deck: deck, urdeck: urdeck, seed: Math.random() * etg.MAX_INT, hp: 200, aimarkpower: 3, aidrawpower: 2, foename: dgname }, aievalopt.checked ? aiEvalFunc : aiFunc);
	game.cost = 20;
	game.gold = 30;
}
var questNecromancerDecks = ["52g 52g 52g 52g 52g 52g 52g 52g 52g 52g 52g 52m 52m 52m 52m 52m 52m 52m 52m 52m 52m 52m 52m 531 531 531 531 52n 52n 52n 52n 717 717 8pk", 
							 "5bs 5bs 5bs 5bs 5bs 5bs 5bs 5bs 5bs 5bs 5bs 5bs 5bs 5bu 5bu 5bu 5bu 5c1 5c1 5c1 5c1 5ca 5ca 8pp",
							 "52g 52g 52g 52g 52g 52g 52g 52g 52g 52g 52g 52g 52g 52m 52m 52m 52m 52m 52m 531 531 531 531 531 52l 52l 52l 52t 52t 52t 52t 52t 535 535 535 535 717 717 717 717 8pk",
							 "606 606 606 606 606 606 606 606 606 606 606 606 5um 5um 5um 5um 5us 5us 5us 5us 5v3 5v3 5v3 5v3 5uu 5uu 5v2 5v2 5va 5va 8pi",
							 "50u 50u 50u 50u 50u 50u 50u 50u 50u 50u 50u 50u 50u 50u 50u 50u 50u 50u 4vi 4vi 4vi 4vi 4vh 4vh 4vh 4vl 501 4vn 4vn 5ur 5uq 5uq 5ut 5ut 5ut 5up 5up 5up 5up 5v2 8pt",
							 "4vq 4vq 4vq 4vq 4vk 4vk 4vk 4vv 4vv 4vo 542 542 542 542 542 542 542 542 542 542 52v 52v 52v 52v 52k 52k 52n 52n 52n 530 530 534 8pj",
							 "5og 5og 5on 5on 5on 5on 5on 5on 5ot 5ot 5ot 5ot 5ot 5ot 6rb 6rb 6rb 6rb 6rb 6rb 6rb 6rb 6rb 6rb 7n6 7n6 7n6 7n6 7n6 7n6 8po",
							 "606 606 606 606 606 606 606 606 606 606 606 5ur 5us 5us 5up 5up 5up 5uu 5uu 5v2 5v2 5vb 5vb 5vb 5uo 5uv 5uv 5v8 5ul 5ul 8pi"];
function mkQuestAi(quest, stage) {
	var deck;
	var foename = "";
	var markpower = 1;
	var drawpower = 1;
	var hp = 100;
	var wintext = "";
	var playerHPstart =100;
	var cardLimCodes; 
	var cardLimMins; 
	var cardLimMaxs;
	var cardMorphFrom=[]; 
	var cardMorphTo=[];
	var restrictDeck = 0;
	if (quest == "necromancer") {
		deck = questNecromancerDecks[stage].split(" ");
		if (stage == 0) {
			foename = "Skeleton Horde";
			hp = 80;
			markpower = 2;
			wintext = "You defeated the horde, but you should find out where they came from"
		}
		else if (stage == 1) {
			foename = "Forest Wildlife"
			hp = 60;
			wintext = "The creatures seemed very afraid of something, like there was something in the forest that did not belong there."
		}
		else if (stage == 2) {
			foename = "An Evil Necromancer";
			hp = 120;
			markpower = 2;
			wintext = "You defeat the evil necromancer but he was merely being possesed.\n\
			The spirit rushes out suddenly and flies to a nearby cave!\nThe poor haggard victim doesn't even remember anything that has happend."
		}
		else if (stage == 3) {
			foename = "Evil spirit";
			hp = 150
			wintext = "You have defeated the evil spirit and stopped its dark influence from spreading through the land!\n\
			... But a dark energy is still troubling this region... \n\
			You sense a cold, chill air coming from a portal looming darkly at the back of the cave."
		}
		else if (stage == 4) {
			foename = "Portal guardian";
			hp = 175
			wintext = "The portal guardian lies vanquished, but despite your best efforts you cannot close the portal from this side.\n\
			Examining the guardian's remains you find an ancient tome which describes the portal before you and the lands beyond\n\
			The incubus key lies in a large fortress at the center of the realm. You will have to venture forth."
		}
		else if (stage == 5) {
			foename = "Grim Maiden";
			hp = 175
			wintext = "The maiden's swarm of skeletal minions seems endless but they are weak and fall easily.\n\
			Her pet cats and vultures tear viciously at your allies, but you finally manage to push past them.\n\
			The Grim Maiden is a truly powerful foe. Her magic wreaking havoc upon your allies.\n\
			Just as you are about to land the final blow, she vanishes.\n\
			You can hear her eerie voice echoing off of the wind, growing faint and distant.\n\
			'Turn back foolish mortal. This road will only lead to your doom. My sisters will not be so forgiving!'"
		}
		else if (stage == 6) {
			foename = "Swamp Gas";
			hp = 100
			wintext = "You escape the deadly explosions, just barely... A massive storm is approaching. You will need shelter.\n\
			A nearby abandoned mansion may be your only option. Warily you open the door. It creaks forebodingly.\n\
			You are greated by dank and musty air, but it seems otherwise empty. You sit and wait out the storm.\n\
			While waiting you could swear you hear footsteps in other rooms and voices talking.\n\
			However, every search turns up nothing but empty ill kept rooms and dust.\n\
			Just as you are about to leave, an evil laugh from behind you sends chills down your spine\n\
			The shadows on the wall begin to move of their own accord. And all the doors slam shut with conviction.\n\
			You turn to face your assailant, apparently a sister of the maiden you fell earlier."
			playerHPstart=75;
		}
		else if (stage == 7) {
			foename = "Spirit of the Dark Maiden"
			hp = 100
			wintext =	"As the maiden falls, your powers return to normal, and your allies settle back into their original forms.\n\
						the shadows that gripped and drained your energies recede. Your strength returns to its former glory.\n\
						You are still feeling tired from the fight, but the storm has passed, leaving an oddly purple sky.\n\
						In light of recent events, you decide it is probably best to get out while you can, tired or not.\n\
						Afterall whatever lies down the road has to be less painful than risking encountering another spirit.\n\
						...right? ... You open the creaky door and head back out down the gravel path.\n\
						as you take your first step you hear the maiden's silvery voice echoing from the house behind you.\n\
						'It appears you may be as stong as my sister claims. Your soul shall make a most delectable morsel.\n\
						'We shall meet again... Don't die before then. I'ld hate to lose my favorite toy.' She fades into the darkness.\n\
						Off in the distance the storm has settled above the castle, the echos of ominous thunder growing fainter.\n\
						You hope it will be gone by the time you get there... but given your luck so far, you don't think it will.\n\
						Storm or not, you didn't come this far just to turn back, so you continue your treck down the path."
			var morphFromList ="4t8 6ro 4vd 6tt 4ve 6tu 4vf 6tv 4vh 6u1 4vm 6u6 4vq 6ua 4vr 6ub 4vs 6uc 4vu 6ue 502 6ui 500 6ug 52h 711 "+
							 "52i 712 52j 713 52k 714 52m 716 52t 71d 52u 71e 534 71k 535 71l 55l 745 55m 746 55n 747 55o 748 55r 74b 55u "+
							 "74e 563 74j 565 74l 566 74m 567 74n 568 74o 56i 752 58p 779 58q 77a 58r 77b 58u 77e 590 77g 591 77h 596 77m "+
							 "597 77n 59c 77s 5bt 7ad 5bu 7ae 5bv 7af 5c0 7ag 5c1 7ah 5c8 7ao 5ca 7aq 5cb 7ar 5cc 7as 5ce 7au 5cf 7av 5cr "+
							 "7bb 5cs 7bc 5cg 7b0 5f1 7dh 5f2 7di 5f3 7dj 5fa 7dq 5fc 7ds 5fd 7dt 5fe 7du 5fh 7e1 5fk 7e4 5i5 7gl 5i6 7gm "+
							 "5ib 7gr 5id 7gt 5ie 7gu 5if 7gv 5ii 7h2 5il 7h5 5io 7h8 5l9 7jp 5la 7jq 5lb 7jr 5le 7ju 5ll 7k5 5ln 7k7 5lo "+
							 "7k8 5lr 7kb 5ls 7kc 5od 7mt 5oe 7mu 5of 7mv 5oj 7n3 5ok 7n4 5or 7nb 5os 7nc 5ot 7nd 5ou 7ne 5p0 7ng 5rh 7q1 "+
							 "5ri 7q2 5rm 7q6 5rn 7q7 5rq 7qa 5rs 7qc 5rt 7qd 5ru 7qe 5s5 7ql 5s4 7qk 5ul 7t5 5um 7t6 5un 7t7 5ut 7td 5uv "+
							 "7tf 5v0 7tg 5v3 7tj 5v8 7to 61p 809 61s 80c 61v 80f 620 80g 625 80l 626 80m 627 80n 62c 80s "+
							 "4sa 6qq 4sc 6qs 4vc 6ts 50u 6ve 52g 710 542 72i 55k 744 576 75m 58o 778 5aa 78q 5bs 7ac 5de 7bu 5f0 7dg 5gi "+
							 "7f2 5i4 7gk 5jm 7i6 5l8 7jo 5mq 7la 5oc 7ms 5pu 7oe 5rg 7q0 5t2 7ri 5uk 7t4 606 7um 61o 808 63a 81q"
			var morphToList ="7tj 7t5 5uv 7td 7td 7tg 5uv 7to 5uv 5uv 7t7 5um 7to 5v3 7t5 5v3 7to 7tf 7tj 5ut 5ut 5v3 5v0 5v3 7t7 5v8 7tf "+
							 "7td 7t6 7t7 7t5 7t6 7tg 7tf 7tf 7t6 5ul 7tg 7t5 5v8 7t6 5v8 7td 5ul 5v3 5v3 5v3 5v0 5uv 5v3 7t7 7tj 7td 7to "+
							 "7t6 5ul 7tj 5ul 5um 7tg 5uv 7t7 7t5 7tg 7to 5v0 7to 7tg 7tf 5ul 5ut 5ul 7tj 5um 5v8 5ul 7tf 7tg 7tj 7tj 7t7 "+
							 "5v3 7tg 7t5 5um 5v3 5ul 7t6 7t6 7tj 7t6 7tf 5uv 5um 7t6 7tf 5un 5ul 5ul 7t7 7td 7td 7td 7t6 7t6 7t6 5uv 7t5 "+
							 "7tg 7td 7td 5ut 5um 5uv 7tf 7to 7tg 5v8 5um 5v0 7to 7t6 7td 5uv 7t6 5um 7tj 5un 7t7 7td 5um 5un 7to 5un 7tj "+
							 "5ut 7t7 5v3 5ul 5un 7t6 7t5 5v8 5un 7td 7t6 7td 7t6 5ul 5v3 5ul 7td 7tj 7tf 7t5 5v0 7to 7tg 5v3 5ul 7to 7tf "+
							 "7tj 5v0 7tf 7to 7td 5v3 7t6 5un 5v3 5um 7tf 7t6 5ut 7td 5v8 7t5 5v8 5v3 7td 5v8 7t7 7to 7t7 5ut 7td 7tj 7tj "+
							 "7t7 5uv 5v0 5uv 5un 7to 7tg 5un 7tf 7tj 5v0 5un 7tj 5v0 5v8 7t6 7to 5um 5um 7t6 7to 5um 7t6 5v8 5un 5ut 5v0 "+
							 "7t6 7tf 7to 7t5 5v8 7t7 7t5 7tj 7t7 7to 5uv 7td 5ul 5v0 7t6 7tg 5ul 5v3 5ul 7td 5um 7t7 "+
							 "7um 7um 7um 7um 7um 7um 7um 7um 7um 7um 7um 7um 7um 7um 7um 7um 7um 7um 7um 7um 7um 7um 7um 7um 7um 7um 7um "+
							 "7um 7um 7um 7um 7um 7um 7um 7um 7um 7um 7um 7um 7um 7um 7um 7um 7um 7um 7um 7um 7um 7um 7um 7um 7um"
			console.log("Debug - morphFromList: ",morphFromList)
			console.log("Debut - morphFromList split: ",morphFromList.split(" "))
			cardMorphFrom = morphFromList.split(" ")
			cardMorphTo = morphToList.split(" ")
		}
		else
			return;
	}
	else
		return;
	var urdeck = getDeck();
	console.log("Debug - cardMorphFrom: ",cardMorphFrom)
	console.log("Debug - cardMorphTo: ",cardMorphTo)
	if ( cardMorphFrom.length > 0 ) {
		if ( cardMorphFrom.length != cardMorphTo.length ) {
			console.log("Warning: morphFrom is not the same length as morphTo. Aborting player deck morph for stage",stage)
		} else {
			urdeck = deckMorph(urdeck,cardMorphFrom,cardMorphTo)
		}
							 
	}
	if ((user && (!user.deck || user.deck.length < 31)) || urdeck.length < 11) {
		/*startEditor();*/
		return "ERROR: Your deck is invalid or missing! Please exit and create a valid deck in the deck editor.";
	}
	initGame({ first: Math.random() < .5, deck: deck, urdeck: urdeck, seed: Math.random() * etg.MAX_INT, hp: hp, aimarkpower: markpower, foename: foename, urhp : playerHPstart, aidrawpower:drawpower }, aievalopt.checked ? aiEvalFunc : aiFunc);
	game.quest = [quest, stage];
	console.log("player1 hps:",game.player1.hp);
	game.wintext = wintext;
}
function mkAi(level) {
	return function() {
		var uprate = level == 1 ? 0 : (level == 2 ? .1 : .3);
		var gameprice = (level == 1 ? 0 : (level == 2 ? 5 : 10));
		function upCode(x) {
			return CardCodes[x].asUpped(Math.random() < uprate).code;
		}
		if (Cards) {
			var urdeck = getDeck();
			if ((user && (!user.deck || user.deck.length < 31)) || urdeck.length < 11) {
				startEditor();
				return;
			}
			var aideckstring = aideck.value, deck;
			if (!user && aideckstring) {
				deck = aideckstring.split(" ");
			} else {
				if (user) {
					if (user.gold < gameprice) {
						chatArea.value = "Requires " + gameprice + "\u00A4";
						return;
					}
					user.gold -= gameprice;
					userEmit("subgold", { g: gameprice });

				}
				var cardcount = {};
				var eles = [Math.ceil(Math.random() * 12), Math.ceil(Math.random() * 12)], ecost = [];
				var pillars = filtercards(false, function(x) { return x.type == PillarEnum && !x.rarity; });
				for (var i = 0;i < 13;i++) {
					ecost[i] = 0;
				}
				deck = [];
				var pl = PlayerRng;
				var anyshield = 0, anyweapon = 0;
				for (var j = 0;j < 2;j++) {
					for (var i = 0;i < (j == 0 ? 20 : 10) ;i++) {
						var maxRarity = level == 1 ? 2 : (level == 2 ? 3 : 4);
						var card = pl.randomcard(Math.random() < uprate, function(x) { return x.element == eles[j] && x.type != PillarEnum && x.rarity <= maxRarity && cardcount[x.code] != 6 && !(x.type == ShieldEnum && anyshield == 3) && !(x.type == WeaponEnum && anyweapon == 3); });
						deck.push(card.code);
						cardcount[card.code] = (cardcount[card.code] || 0) + 1;
						if (!(((card.type == WeaponEnum && !anyweapon) || (card.type == ShieldEnum && !anyshield)) && cardcount[card.code])) {
							ecost[card.costele] += card.cost;
						}
						if (card.cast) {
							ecost[card.castele] += card.cast * 1.5;
						}
						if (card == Cards.Nova || card == Cards.SuperNova) {
							for (var k = 1;k < 13;k++) {
								ecost[k]--;
							}
						} else if (card.type == ShieldEnum) anyshield++;
						else if (card.type == WeaponEnum) anyweapon++;
					}
				}
				if (!anyshield) {
					var card = CardCodes[deck[0]];
					ecost[card.costele] -= card.cost;
					deck[0] = Cards.Shield.asUpped(Math.random() < uprate).code;
				}
				if (!anyweapon) {
					var card = CardCodes[deck[1]];
					ecost[card.costele] -= card.cost;
					deck[1] = (eles[1] == Air ? Cards.ShortBow :
                        eles[1] == Gravity || eles[1] == Earth ? Cards.Hammer :
                        eles[1] == Water || eles[1] == Life ? Cards.Staff :
                        eles[1] == Darkness || eles[1] == Death ? Cards.Dagger :
                        Cards.ShortSword).asUpped(Math.random() < uprate).code;
				}
				var pillarstart = deck.length, qpe = 0, qpemin = 99;
				for (var i = 1;i < 13;i++) {
					if (!ecost[i]) continue;
					qpe++;
					qpemin = Math.min(qpemin, ecost[i]);
				}
				if (qpe >= 4) {
					for (var i = 0;i < qpemin * .8;i++) {
						deck.push(upCode(Cards.QuantumPillar.code));
						qpe++;
					}
				} else qpemin = 0;
				for (var i = 1;i < 13;i++) {
					if (!ecost[i]) continue;
					for (var j = 0;j < Math.round((ecost[i] - qpemin) / 5) ;j++) {
						deck.push(upCode(pillars[i * 2]));
					}
				}
				deck.push(TrueMarks[eles[1]]);
				chatArea.value = deck.join(" ");
			}

			var randomNames = [
                "Sherman",
                "Billie",
                "Monroe",
                "Brendon",
                "Murray",
                "Ronald",
                "Garland",
                "Emory",
                "Dane",
                "Rocky",
                "Stormy",
                "Audrie",
                "Page",
                "Martina",
                "Adrienne",
                "Yuriko",
                "Margie",
                "Tammi",
                "Digna",
                "Mariah",
                "Seth"
			];

			var typeName = [
                "Commoner",
                "Mage",
                "Champion"
			];

			var foename = typeName[level - 1] + "\n" + randomNames[Math.floor(Math.random() * randomNames.length)];

			initGame({ first: Math.random() < .5, deck: deck, urdeck: urdeck, seed: Math.random() * etg.MAX_INT, hp: level == 1 ? 100 : (level == 2 ? 125 : 150), aimarkpower: level == 3 ? 2 : 1, foename: foename }, aievalopt.checked ? aiEvalFunc : aiFunc);
			game.cost = gameprice;
			game.level = level;
			game.gold = level == 1 ? 5 : (level == 2 ? 10 : 20);
		}
	}
}

// Asset Loaders
var nopic = PIXI.Texture.fromImage("assets/null.png")
var imageLoadingNumber = 9;
var questIcons = [];
var questLoader = new PIXI.AssetLoader(["assets/questIcons.png"])
questLoader.onComplete = function() {
	var tex = PIXI.Texture.fromImage("assets/questIcons.png");
	for (var i = 0;i < 2;i++) {
		questIcons.push(new PIXI.Texture(tex, new PIXI.Rectangle(i * 32, 0, 32, 32)));
	}
	maybeStartMenu();
}
questLoader.load();
var backgrounds = ["assets/bg_default.png", "assets/bg_lobby.png", "assets/bg_shop.png", "assets/bg_quest.png","assets/bg_game.png" ];
var bgLoader = new PIXI.AssetLoader(backgrounds);
bgLoader.onComplete = function() {
	var tmp = [];
	for (var i = 0;i < 5;i++) tmp.push(PIXI.Texture.fromImage(backgrounds[i]));
	backgrounds = tmp;
	maybeStartMenu();
}
bgLoader.load();

var eicons = [];
var eleLoader = new PIXI.AssetLoader(["assets/esheet.png"]);
eleLoader.onComplete = function() {
	var tex = PIXI.Texture.fromImage("assets/esheet.png");
	for (var i = 0;i < 13;i++) eicons.push(new PIXI.Texture(tex, new PIXI.Rectangle(i * 32, 0, 32, 32)));
	maybeStartMenu();
}
eleLoader.load();

var cardBacks = [];
var backLoader = new PIXI.AssetLoader(["assets/backsheet.png"]);
backLoader.onComplete = function() {
	var tex = PIXI.Texture.fromImage("assets/backsheet.png");
	for (var i = 0;i < 26;i++) cardBacks.push(new PIXI.Texture(tex, new PIXI.Rectangle(i * 132, 0, 132, 256)));
	maybeStartMenu();
}
backLoader.load();

var cardBorders = []
var borderLoader = new PIXI.AssetLoader(["assets/cardborders.png"]);
borderLoader.onComplete = function() {
	var tex = PIXI.Texture.fromImage("assets/cardborders.png");
	for (var i = 0;i < 26;i++) cardBorders.push(new PIXI.Texture(tex, new PIXI.Rectangle(i * 128, 0, 128, 162)));
	maybeStartMenu();
}
borderLoader.load();

var rarityicons = [];
var rarityLoader = new PIXI.AssetLoader(["assets/raritysheet.png"]);
rarityLoader.onComplete = function() {
	var tex = PIXI.Texture.fromImage("assets/raritysheet.png");
	for (var i = 0;i < 6;i++) rarityicons.push(new PIXI.Texture(tex, new PIXI.Rectangle(i * 10, 0, 10, 10)));
	maybeStartMenu();
}
rarityLoader.load();

var buttonsList = [];
var buttonsClicked = [];
var buttonsMouseOver = [];
var buttons = {};
var buttonLoader = new PIXI.AssetLoader(["assets/buttons.png", "assets/buttons_mouseover.png", "assets/buttons_clicked.png"]);
buttonLoader.onComplete = function() {
	var tex = PIXI.Texture.fromImage("assets/buttons.png");
	var texClick = PIXI.Texture.fromImage("assets/buttons_clicked.png");
	var texOver = PIXI.Texture.fromImage("assets/buttons_mouseover.png");
	for (var i = 0;i < 7;i++) {
		for (var j = 0;j < 4;j++) {
			buttonsList.push(new PIXI.Texture(tex, new PIXI.Rectangle(j * 75 + 7, i * 28 + 19, 75, 25)));
			buttonsMouseOver.push(new PIXI.Texture(texOver, new PIXI.Rectangle(j * 75 + 7, i * 28 + 19, 75, 25)));
			buttonsClicked.push(new PIXI.Texture(texClick, new PIXI.Rectangle(j * 75 + 7, i * 28 + 19, 75, 25)));
		}
	}
	buttons = {
		logout: buttonsList[0],
		arenainfo: buttonsList[1],
		arenat10: buttonsList[2],
		arenaai: buttonsList[3],
		commoner: buttonsList[4],
		mage: buttonsList[5],
		champion: buttonsList[6],
		demigod: buttonsList[7],
		wipeaccount: buttonsList[8],
		editor: buttonsList[9],
		shop: buttonsList[10],
		exit: buttonsList[11],
		buypack: buttonsList[12],
		takecards: buttonsList[13],
		upgrade: buttonsList[14],
		quests: buttonsList[15],
		clear: buttonsList[16],
		done: buttonsList[17],
		import: buttonsList[18],
		resign: buttonsList[19],
		mulligan: buttonsList[20],
		endturn: buttonsList[21],
		cancel: buttonsList[22],
		accepthand: buttonsList[23],
		confirm: buttonsList[24],
		deck1: buttonsList[25],
		deck2: buttonsList[26],
		deck3: buttonsList[27]
	}
	maybeStartMenu();
}

function buttonArtClicked(button) {
	return buttonsClicked[buttonsList.indexOf(button)];
}
function buttonArtMouseover(button) {
	return buttonsMouseOver[buttonsList.indexOf(button)];
}
buttonLoader.load();

var boosters = [];
var boosterLoader = new PIXI.AssetLoader(["assets/boosters.png"]);
boosterLoader.onComplete = function() {
	var tex = PIXI.Texture.fromImage("assets/boosters.png");
	for (var i = 0;i < 2;i++)
		for (var j = 0;j < 4;j++)
			boosters.push(new PIXI.Texture(tex, new PIXI.Rectangle(j * 100, i * 150, 100, 150)));
	maybeStartMenu();
}
boosterLoader.load();

var popups = [];
var popupLoader = new PIXI.AssetLoader(["assets/popup_booster.png"]);
popupLoader.onComplete = function() {
	for (var i = 0;i < 1;i++) popups.push(PIXI.Texture.fromImage("assets/popup_booster.png"));
	maybeStartMenu();
}
popupLoader.load();

function makeButton(x, y, w, h, i, mouseoverfunc) {
	var b = new PIXI.Sprite(i);
	b.position.set(x, y);
	b.interactive = true;
	b.hitArea = new PIXI.Rectangle(0, 0, w, h);
	b.buttonMode = true;
	b.standardImage = i;
	if (~buttonsList.indexOf(i)) {
		b.mousedown = function() {
			b.setTexture(buttonArtClicked(b.standardImage));
		}
		b.mouseover = b.mouseup = function() {
			if (mouseoverfunc) mouseoverfunc();
			b.setTexture(buttonArtMouseover(b.standardImage));
		}
		b.mouseout = function() {
			b.setTexture(b.standardImage);
		}
	}

	return b;
}

function makeText(x, y, txt, vis) {
	var t = new PIXI.Text(txt, { font: "14px Verdana", fill: "white", stroke: "black", strokeThickness: 2 });
	t.position.set(x, y);
	t.visible = vis;

	return t;
}

function toggleB() {
	for (var i = 0;i < arguments.length;i++) {
		arguments[i].visible = !arguments[i].visible;
		arguments[i].interactive = !arguments[i].interactive;
		arguments[i].buttonMode = !arguments[i].buttonMode;
	}
}
function maybeStartMenu() {
	imageLoadingNumber--;
	console.log(imageLoadingNumber);
	if (imageLoadingNumber == 0) {
		startMenu();
		requestAnimate();
	}
}
function startMenu() {
	menuui = new PIXI.Stage(0x000000, true);
	var buttonList = [];
	var mouseroverButton;
	var clickedButton;
	//lobby background
	var bglobby = new PIXI.Sprite(backgrounds[1]);
	bglobby.interactive = true;
	bglobby.hitArea = new PIXI.Rectangle(0, 0, 900, 670);
	bglobby.mouseover = function() {
		tinfo.setText("");
		tcost.setText("");
		igold2.visible = false;
	}
	menuui.addChild(bglobby);

	//gold text
	var tgold = makeText(755, 101, (user ? user.gold : "Sandbox"), true);
	menuui.addChild(tgold);

	//info text
	var tinfo = makeText(50, 26, "", true)
	menuui.addChild(tinfo);

	//cost text
	var tcost = makeText(50, 51, "", true);
	menuui.addChild(tcost);

	//gold icons
	var igold = PIXI.Sprite.fromImage("assets/gold.png");
	igold.position.set(750, 100);
	igold.visible = false;
	menuui.addChild(igold);

	var igold2 = PIXI.Sprite.fromImage("assets/gold.png");
	igold2.position.set(95, 50);
	igold2.visible = false;
	menuui.addChild(igold2);

	//ai0 button
	var bai0 = makeButton(50, 100, 75, 25, buttons.commoner, function() {
		tinfo.setText("Commoners have no upgraded cards.");
		tcost.setText("Cost:     0");
		igold2.visible = true;
	});
	bai0.click = mkAi(1);
	menuui.addChild(bai0);

	//ai1 button
	var bai1 = makeButton(150, 100, 75, 25, buttons.mage, function() {
		tinfo.setText("Mages have a few upgraded cards.");
		tcost.setText("Cost:     5");
		igold2.visible = true;
	});
	bai1.click = mkAi(2);
	menuui.addChild(bai1);

	//ai2 button
	var bai2 = makeButton(250, 100, 75, 25, buttons.champion, function() {
		tinfo.setText("Champions have some upgraded cards.");
		tcost.setText("Cost:     10");
		igold2.visible = true;
	});
	bai2.click = mkAi(3);
	menuui.addChild(bai2);

	//ai3 button
	var bai3 = makeButton(350, 100, 75, 25, buttons.demigod, function() {
		tinfo.setText("Demigods are extremely powerful. Come prepared for anything.");
		tcost.setText("Cost:     20");
		igold2.visible = true;
	});
	bai3.click = mkDemigod;
	menuui.addChild(bai3);

	//Quests button
	var bquest = makeButton(50, 145, 75, 25, buttons.quests, function() {
		tinfo.setText("Go on adventure!");
	});
	bquest.click = startQuestWindow;
	menuui.addChild(bquest);

	//ai arena button
	var baia = makeButton(50, 200, 75, 25, buttons.arenaai, function() {
		tinfo.setText("In the arena you will face decks from other players.");
		tcost.setText("Cost:     10");
		igold2.visible = true;
	});
	baia.click = function() {
		if (Cards) {
			if (!user.deck || user.deck.length < 31) {
				startEditor();
				return;
			}

			if (user.gold < 10) {
				chatArea.value = "Requires 10g";
				return;
			}

			user.gold -= 10;
			userEmit("subgold", { g: 10 });
			userEmit("foearena");
		}
	}
	menuui.addChild(baia);

	//arena info button
	var binfoa = makeButton(50, 245, 75, 25, buttons.arenainfo, function() {
		tinfo.setText("Check how your arena deck is doing.")
		tcost.setText("");
	});
	binfoa.click = function() {
		if (Cards) {
			userEmit("arenainfo");
		}
	}
	menuui.addChild(binfoa);

	//arena top10 button
	var btopa = makeButton(150, 245, 75, 25, buttons.arenat10, function() {
		tinfo.setText("Here you can see who the top players in arena are right now.")
		tcost.setText("");
	});
	btopa.click = function() {
		if (Cards) {
			userEmit("arenatop");
		}
	}
	menuui.addChild(btopa);

	//edit button
	var bedit = makeButton(50, 300, 75, 25, buttons.editor, function() {
		tinfo.setText("Here you can edit your deck, as well as submit an arena deck.");
		tcost.setText("");
	});
	bedit.click = startEditor;
	menuui.addChild(bedit);

	var bshop = makeButton(150, 300, 75, 25, buttons.shop, function() {
		tinfo.setText("Here you can buy booster packs which contains cards from the elements you choose.");
		tcost.setText("");
	});
	bshop.click = startStore;
	menuui.addChild(bshop);

	//upgrade button
	var bupgrade = makeButton(250, 300, 75, 18, buttons.upgrade, function() {
		tinfo.setText("Here you can upgrade cards as well as buy upgraded Pillars");
		tcost.setText("");
	});
	bupgrade.click = upgradestore;
	menuui.addChild(bupgrade);

	//logout button
	var blogout = makeButton(750, 246, 75, 25, buttons.logout, function() {
		tinfo.setText("Click here if you want to log out.")
		tcost.setText("");
	});
	blogout.click = function() {
		userEmit("logout");
		logout();

	}
	menuui.addChild(blogout);

	//delete account button
	var bdelete = makeButton(750, 550, 75, 25, buttons.wipeaccount, function() {
		tinfo.setText("Click here if you want to remove your account.")
		tcost.setText("");
	});
	bdelete.click = function() {
		if (foename.value == user.name) {
			userEmit("delete");
			logout();
		} else {
			chatArea.value = "Input '" + user.name + "' into Challenge to delete your account";
		}
	}
	menuui.addChild(bdelete);

	if (!user) toggleB(baia, bshop, bupgrade, binfoa, btopa, blogout, bdelete, bquest);

	//only display if user is logged in
	if (user) {
		tgold.position.set(770, 101);
		igold.visible = true;

		if (user.oracle) {
			// todo user.oracle should be a card, not true. The card is the card that the server itself added. This'll only show what was added
			delete user.oracle;
			var card = PlayerRng.randomcard(false,
                (function (y) { return function (x) { return x.type != PillarEnum && ((x.rarity != 5) ^ y); } })(Math.random() < .03));
			cardcode = card.code;
			var bound = card.rarity >= 2
			userEmit("addcard", { c: cardcode, o: cardcode, accountbound: bound });
			user.ocard = cardcode;
            if (bound)
                user.accountbound.push(cardcode);
			else
                user.pool.push(cardcode);
			var oracle = new PIXI.Sprite(nopic);
			oracle.position.set(450, 100);
			menuui.addChild(oracle);
		}
	}

	function logout() {
		user = undefined;

		toggleB(baia, bshop, bupgrade, binfoa, btopa, blogout, bdelete, bquest);

		tgold.setText("Sandbox");
		tgold.position.set(755, 101);
		igold.visible = false;

		if (oracle) {
			menuui.removeChild(oracle);
		}
	}

	animCb = function() {
		if (user && oracle) {
			oracle.setTexture(getArt(cardcode));
		}
	}

	mainStage = menuui;
	refreshRenderer();
}
function startQuest(questname) {
	if (!user.quest[questname] && user.quest[questname] != 0) {
		user.quest[questname] = 0;
		userEmit("updatequest", { quest: questname, newstage: 0 });
	}
}
function startQuestWindow() {
	//Start the first quest
	startQuest("necromancer");

	var questui = new PIXI.Stage(0x454545, true);
	var bgquest = new PIXI.Sprite(backgrounds[3]);
	bgquest.interactive = true;
	bgquest.hitArea = new PIXI.Rectangle(0, 0, 900, 670);
	bgquest.mouseover = function() {
		tinfo.setText("");
	}
	questui.addChild(bgquest);
	var tinfo = makeText(50, 26, "", true)
	var errinfo = makeText(50,125,"",true)
	var quest1Buttons = [];
	function makeQuestButton(quest, stage, text, pos) {
		var button = makeButton(pos[0], pos[1], 64, 64, user.quest[quest] > stage ? questIcons[1] : questIcons[0]);
		button.mouseover = function() {
			tinfo.setText(text);
		}
		button.click = function() {
			var errText = mkQuestAi(quest, stage);
			/*console.log("error text was: ",errText)
			console.log("errText ? evaluates as:", errText ? "true" : "false")*/
			errText ? errinfo.setText(errText) : errinfo.setText("");
		}
		return button;
	}
	var necromancerTexts = ["A horde of skeletons have been seen nearby, perhaps you should go investigate?", 
							"They seemed to come from the forest, so you go inside.", 
							"Deep inside the forest you find the necromancer responsible for filling the lands with undead!",
							"You pursue the energy trail of the spirit to a dark cavern.\n\
							At first you think it has eluded you, but as you turn to leave, its dark shadowy form rises in front of you",
							"You approach the portal and a large Elemental steps out of the shadows, purple energy swirling about it.\n\
							'Only the worthy may pass'...You state that your only intention is to destroy the portal not pass through it.\n\
							'only the incubus key can close this portal.' The guardian glowers at you darkly.\n\
							If you wish to find it you must first pass my test.' The guardian attacks!",
							"You step through the portal and are wisked off to a shifting expanse of swampland. Purple lightning crackles above.\n\
							Far off, in the distant center of the dark and brooding expanse, stands an ominous fortress.\n\
							The gravel road before you winds its way toward it like a great serpent slithering its way through a desolate bog.\n\
							A lone maiden blocks your path. In a voice like claws upon glass she shrieks 'you do not belong here... DIE!' ",
							"As you continue up the road, a foul stench assaults your nose... Then you hear a poping sound.\n\
							To the side of the road a sign reads 'Danger, swamp gas is explosive. Travelers beware'\n\
							You decide that NOW would be a good time to run!... But a flock of giant angry birds is in your way",
							"You turn to face your attacker, but as you call on your powers, only darkness answers.\n\
							Your allies come to your aid but their forms have all been twisted. The dark lady laughs mischeviously.\n\
							'You must think yourself dreaming... Well this is the nightmare realm, and I am the one in control.\n\
							I think I will toy with you first... before I swallow your soul.' The shadows lunge toward you in a vicious attack."
							];
	var necromancerPos = [[200, 200], [200, 250], [225, 300], [275,350], [325,375], [500,200], [500,250], [525,275]];
	if (user.quest.necromancer || user.quest.necromancer == 0) {
		for (var i = 0;i <= user.quest.necromancer;i++) {
			if (necromancerTexts[i]) {
				var button = makeQuestButton("necromancer", i, necromancerTexts[i], necromancerPos[i]);
				questui.addChild(button);
			}
		}
	}
	var bexit = makeButton(750, 246, 75, 18, buttons.exit);
	bexit.click = function() {
		startMenu();
	}
	questui.addChild(tinfo);
	questui.addChild(errinfo);
	questui.addChild(bexit);
	animCb = undefined;
	mainStage = questui;
	refreshRenderer();
}
function editorCardCmp(x, y) {
	var cardx = CardCodes[x], cardy = CardCodes[y];
	return cardx.upped - cardy.upped || cardx.element - cardy.element || cardx.cost - cardy.cost || (x > y) - (x < y);
}

function upgradestore() {
	function isFreeCard(card) {
		return card.type == PillarEnum && !card.upped && !card.rarity;
	}
	function upgradeCard(card) {
		if (!card.upped) {
			if (!isFreeCard(card)) {
				if (cardpool[card.code] >= 6) {
					userEmit("upgrade", { card: card.code, newcard: card.asUpped(true).code });
					for (var i = 0;i < 6;i++) {
						user.pool.splice(user.pool.indexOf(card.code), 1);
					}
					user.pool.push(card.asUpped(true).code);
					adjustdeck();
				}
				else twarning.setText("You need at least 6 copies to be able to upgrade this card!");
			}
			else {
				if (user.gold >= 50) {
					user.gold -= 50;
					userEmit("subgold", { g: 50 });
					userEmit("addcard", { c: card.asUpped(true).code });
					user.pool.push(card.asUpped(true).code);
					adjustdeck();
				}
				else twarning.setText("You need at least 50 gold to be able to upgrade a pillar!");
			}
		}
		else twarning.setText("You can't upgrade an already upgraded card!");
	}
	function adjustdeck() {
		cardpool = {};
		for (var i = 0;i < user.pool.length;i++) {
			if (user.pool[i] in cardpool) {
				cardpool[user.pool[i]]++;
			} else {
				cardpool[user.pool[i]] = 1;
			}
		}
	}
	var upgradeui = new PIXI.Stage(0x336699, true);
	var bg = new PIXI.Sprite(backgrounds[0]);
	upgradeui.addChild(bg);

	var goldcount = new PIXI.Text(user.gold + "g", { font: "bold 16px Dosis" });
	goldcount.position.set(30, 100);
	upgradeui.addChild(goldcount);
	var bupgrade = makeButton(150, 100, 75, 18, buttons.upgrade);
	bupgrade.click = function() {
		upgradeCard(CardCodes[selectedCard]);
	};
	upgradeui.addChild(bupgrade);
	var bexit = makeButton(50, 50, 75, 18, buttons.exit);
	bexit.click = function() {
		startMenu();
	};
	upgradeui.addChild(bexit);
	var tinfo = new PIXI.Text("", { font: "bold 16px Dosis" });
	tinfo.position.set(130, 120);
	upgradeui.addChild(tinfo);
	var twarning = new PIXI.Text("", { font: "bold 16px Dosis" });
	twarning.position.set(100, 70);
	upgradeui.addChild(twarning);

	var editorcolumns = [];
	var selectedCard;
	var upgradedCard;
	var mouseovercode;
	var cardpool = {};
	var chosenelement = 0;
	adjustdeck();

	var editoreleicons = [];
	for (var i = 0;i < 13;i++) {
		var sprite = new PIXI.Sprite(nopic);
		sprite.position.set(8, 184 + i * 32);
		setInteractive(sprite);
		(function(_i) {
			sprite.click = function() { chosenelement = _i; }
		})(i);
		editoreleicons.push(sprite);
		upgradeui.addChild(sprite);
	}
	for (var i = 0;i < 6;i++) {
		editorcolumns.push([[], []]);
		for (var j = 0;j < 15;j++) {
			var sprite = new PIXI.Sprite(nopic);
			sprite.position.set(100 + i * 130, 272 + j * 20);
			var sprcount = new PIXI.Text("", { font: "12px Dosis" });
			sprcount.position.set(102, 4);
			sprite.addChild(sprcount);
			(function(_i, _j) {
				sprite.click = function() {
				    selectedCard = mouseovercode;
                    upgradedCard = CardCodes[mouseovercode].asUpped(true).code
				    if (isFreeCard(CardCodes[mouseovercode]))
						tinfo.setText("Costs 50 gold to upgrade");
					else tinfo.setText("Convert 6 of these into an upgraded version.");
					twarning.setText("");
				}
				sprite.mouseover = function() {
				    mouseovercode = editorcolumns[_i][1][chosenelement][_j];
				}
			})(i, j);
			sprite.interactive = true;
			upgradeui.addChild(sprite);
			editorcolumns[i][0].push(sprite);
		}
		for (var j = 0;j < 13;j++) {
			editorcolumns[i][1].push(filtercards(i > 2,
                function(x) { return x.element == j && ((i % 3 == 0 && x.type == CreatureEnum) || (i % 3 == 1 && x.type <= PermanentEnum) || (i % 3 == 2 && x.type == SpellEnum)); },
                editorCardCmp));
		}
	}
	var cardArt = new PIXI.Sprite(nopic);
	cardArt.position.set(734, 8);
	upgradeui.addChild(cardArt);
	var selectedCardArt = new PIXI.Sprite(nopic);
	selectedCardArt.position.set(534, 8);
	upgradeui.addChild(selectedCardArt);
	animCb = function() {
	    if (upgradedCard) {
	        cardArt.setTexture(getArt(upgradedCard));
		}
		if (selectedCard) {
			selectedCardArt.setTexture(getArt(selectedCard));
		}
		for (var i = 0;i < 13;i++) {
			editoreleicons[i].setTexture(getIcon(i));
		}
		for (var i = 0;i < 6;i++) {
			for (var j = 0;j < editorcolumns[i][1][chosenelement].length;j++) {
				var spr = editorcolumns[i][0][j], code = editorcolumns[i][1][chosenelement][j], card = CardCodes[code];
				if (card in cardpool || isFreeCard(card)) spr.visible = true;
				else spr.visible = false;
				spr.setTexture(getCardImage(code));
				var txt = spr.getChildAt(0), card = CardCodes[code], inf = isFreeCard(card);
				if ((txt.visible = inf || code in cardpool)) {
					maybeSetText(txt, inf ? "-" : (cardpool[code].toString()));
				}
			}
			for (;j < 15;j++) {
				editorcolumns[i][0][j].visible = false;
			}
		}
		goldcount.setText(user.gold + "g");
	}
	mainStage = upgradeui;
	refreshRenderer();
}

function startStore() {
	var cardartcode;
	var packtype = 0;
	var packrarity = 0;
	var cardamount = 0;
	var cost = 0;
	var newCards = [];
	var newCardsArt = [];
	var accountbound = false;

	var storeui = new PIXI.Stage(0x000000, true);

	//shop background
	var bgshop = new PIXI.Sprite(backgrounds[2]);
	storeui.addChild(bgshop);

	//gold text
	var tgold = makeText(770, 101, user.gold, true);
	storeui.addChild(tgold);

	//info text
	var tinfo = makeText(50, 26, "Select which elements you want.", true);
	storeui.addChild(tinfo);

	var tinfo2 = makeText(50, 51, "Select which type of booster you want.", true);
	storeui.addChild(tinfo2);

    //free packs text
	var freeinfo = makeText(300, 26, "", true);
	storeui.addChild(freeinfo);

	//gold icon
	var igold = PIXI.Sprite.fromImage("assets/gold.png");
	igold.position.set(750, 100);
	storeui.addChild(igold);

	//get cards button
	var bget = makeButton(750, 156, 75, 18, buttons.takecards);
	toggleB(bget);
	bget.click = function () {
	    if (!accountbound) {
	        userEmit("add", { add: etg.encodedeck(newCards) });
	        for (var i = 0; i < newCards.length; i++) {
	            user.pool.push(newCards[i]);
	            newCardsArt[i].visible = false;
	        }
	    }
	    else {
	        userEmit("addaccountbound", { add: etg.encodedeck(newCards) });
	        for (var i = 0; i < newCards.length; i++) {
	            user.accountbound.push(newCards[i]);
	            newCardsArt[i].visible = false;
	        }
	    }

		toggleB(bbronze, bsilver, bgold, bplatinum, bget, bbuy);
		popbooster.visible = false;
		newCards = [];
		accountbound = false;
	}
	storeui.addChild(bget);

	//exit button
	var bexit = makeButton(750, 246, 75, 18, buttons.exit);
	bexit.click = function() {
		if (isEmpty(newCards)) {
			startMenu();
		} else {
			tinfo.setText("Get your cards before leaving!");
			tinfo2.setText("");
		}
	}
	storeui.addChild(bexit);

	//buy button
	var bbuy = makeButton(750, 156, 75, 18, buttons.buypack);
	bbuy.click = function() {
	    if (isEmpty(newCards)) {
	        if (!packrarity) {
	            tinfo2.setText("Select a pack first!");
	            return;
	        }
	        if (!packtype) {
	            tinfo.setText("Select an element first!");
	            return;
	        }
			if (user.gold >= cost || user.freepacks[packrarity-1] > 0) {
				var allowedElements = []
				
				if (user.freepacks[packrarity - 1] > 0){
				    userEmit("usefreepack", {type: packrarity-1,amount:1});
				    user.freepacks[packrarity - 1]--;
				    accountbound = true;
				}
				else {
				    user.gold -= cost;
				    userEmit("subgold", { g: cost });
				}

				for (var i = 0;i < cardamount;i++) {
					var rarity = 1;
					if ((packrarity == 2 && i >= 3) || (packrarity == 3 && i >= 3) || (packrarity == 4 && i>=4))
						rarity = 2;
					if ((packrarity == 3 && i >= 7) || (packrarity == 4 && i >= 7))
						rarity = 3;
					if (packrarity == 4 && i >= 8)
						rarity = 4;
					var fromElement = Math.random() < .4 ? false : true;
					newCards.push(PlayerRng.randomcard(false, function(x) { return (x.element == packtype) ^ fromElement && x.type != PillarEnum && x.rarity == rarity }).code);
					newCardsArt[i].setTexture(getArt(newCards[i]));
					newCardsArt[i].visible = true;
				}

				toggleB(bbronze, bsilver, bgold, bplatinum, bget, bbuy);
				popbooster.visible = true;
				updateFreeText()
			} else {
				tinfo2.setText("You can't afford that!");
			}
		} else {
			tinfo.setText("Take your cards before you buy more!");
			tinfo2.setText("");
		}
	}
	storeui.addChild(bbuy);

	function updateFreeText(){
	    if (user.freepacks[packrarity - 1]) freeinfo.setText("Free boosters of this type left: " + user.freepacks[packrarity - 1]);
	    else freeinfo.setText("");
        }
	
	// The different pack types
	var bbronze = makeButton(50, 280, 100, 200, boosters[4]);
	bbronze.click = function() {
		packrarity = 1;
		tinfo2.setText("Bronze Pack: 9x Common");
		cardamount = 9;
		cost = 15;
		updateFreeText()
	}
	storeui.addChild(bbronze);

	var bsilver = makeButton(175, 280, 100, 200, boosters[5]);
	bsilver.click = function() {
		packrarity = 2;
		tinfo2.setText("Silver Pack: 3x Common + 3x Uncommon");
		cardamount = 6;
		cost = 25
		updateFreeText()
	}
	storeui.addChild(bsilver);

	var bgold = makeButton(300, 280, 100, 200, boosters[6]);
	bgold.click = function() {
		packrarity = 3;
		tinfo2.setText("Gold Pack: 3x Common + 4x Uncommon + 1x Rare");
		cardamount = 8;
		cost = 65;
		updateFreeText()
	}
	storeui.addChild(bgold);

	var bplatinum = makeButton(425, 280, 100, 200, boosters[7]);
	bplatinum.click = function() {
		packrarity = 4;
		tinfo2.setText("Platinum Pack: 4x Common + 3x Uncommon + 1x Rare + 1x Shard");
		cardamount = 9;
		cost = 100;
		updateFreeText()
	}
	storeui.addChild(bplatinum);

	for (var i = 1;i < 13;i++) {
		var elementbutton = makeButton(75 + Math.floor((i-1) / 2)*75, 120 + ((i-1) % 2)*75, 32, 32, eicons[i]);
		(function(_i) {
			elementbutton.click = function() {
				packtype = _i;
				tinfo.setText("Selected Element: " + descr[_i]);
			}
		})(i);
		storeui.addChild(elementbutton);
	}

	//booster popup
	var popbooster = new PIXI.Sprite(popups[0]);
	popbooster.position.set(43, 93);
	popbooster.visible = false;
	storeui.addChild(popbooster);

	//draw cards that are pulled from a pack
	for (var i = 0;i < 2;i++) {
		for (var j = 0;j < 5;j++) {
			var cardArt = new PIXI.Sprite(nopic);
			cardArt.scale = new PIXI.Point(0.85, 0.85)
			cardArt.position.set(50 + (j * 125), 100 + (i * 225));
			storeui.addChild(cardArt);

			newCardsArt.push(cardArt);
		}
	}

	//update loop
	animCb = function() {
		for (var i = 0;i < 10;i++) {
			if (newCards[i]) newCardsArt[i].setTexture(getArt(newCards[i]));
		}

		tgold.setText(user.gold);
	}

	mainStage = storeui;
	refreshRenderer();
}

function startEditor() {
	function adjustCardMinus(code, x) {
		if (code in cardminus) {
			cardminus[code] += x;
		} else cardminus[code] = x;
	}
	function isFreeCard(card) {
		return card.type == PillarEnum && !card.upped && !card.rarity;
	}
	function processDeck() {
		for (var i = editordeck.length - 1;i >= 0;i--) {
			if (!(editordeck[i] in CardCodes)) {
				var index = TrueMarks.indexOf(editordeck[i]);
				if (index >= 0) {
					editormark = index;
				}
				editordeck.splice(i, 1);
			}
		}
		editordeck.sort(editorCardCmp);
		if (usePool) {
			cardminus = {};
			cardpool = {};
			for (var i = 0;i < user.pool.length;i++) {
				if (user.pool[i] in cardpool) {
					cardpool[user.pool[i]]++;
				} else {
					cardpool[user.pool[i]] = 1;
				}
			}
			if (user.starter) {
			    for (var i = 0; i < user.starter.length; i++) {
			        if (user.starter[i] in cardpool) {
			            cardpool[user.starter[i]]++;
			        } else {
			            cardpool[user.starter[i]] = 1;
			        }
			    }
			}
			if (user.accountbound) {
			    for (var i = 0; i < user.accountbound.length; i++) {
			        if (user.accountbound[i] in cardpool) {
			            cardpool[user.accountbound[i]]++;
			        } else {
			            cardpool[user.accountbound[i]] = 1;
			        }
			    }
			}
			for (var i = editordeck.length - 1;i >= 0;i--) {
				var code = editordeck[i];
				if (CardCodes[code].type != PillarEnum) {
					var card = CardCodes[code];
					if ((cardminus[card.asUpped(false).code] || 0) + (cardminus[card.asUpped(true).code] || 0) == 6) {
						editordeck.splice(i, 1);
						continue;
					}
				}
				if (!isFreeCard(CardCodes[code])) {
					if ((cardminus[code] || 0) < (cardpool[code] || 0)) {
						adjustCardMinus(code, 1);
					} else {
						editordeck.splice(i, 1);
					}
				}
			}
		}
	}
	if (Cards && (!user || user.deck)) {
		var usePool = !!(user && (user.deck || user.starter));
		var cardminus, cardpool, cardartcode;
		chatArea.value = "Build a 30-60 card deck";
		var editorui = new PIXI.Stage(0x336699, true), editorelement = 0;
		var bg = new PIXI.Sprite(backgrounds[0]);
		editorui.addChild(bg);
		var bclear = makeButton(8, 8, 75, 18, buttons.clear);
		var bsave = makeButton(8, 32, 75, 18, buttons.done);
		var bimport = makeButton(8, 56, 75, 18, buttons.import);
		var bdeck1 = makeButton(8, 80, 75, 18, buttons.deck1);
		var bdeck2 = makeButton(8, 104, 75, 18, buttons.deck2);
		var bdeck3 = makeButton(8, 128, 75, 18, buttons.deck3);
		var barena = makeButton(8, 152, 75, 18, buttons.arenaai, function() {
			if (user && user.ocard) {
				chatArea.value = "Oracle Card: " + CardCodes[user.ocard].name;
			}
		});
		bclear.click = function() {
			if (usePool) {
				cardminus = {};
			}
			editordeck.length = 0;
		}
		bsave.click = function() {
			editordeck.push(TrueMarks[editormark]);
			deckimport.value = editordeck.join(" ");
			if (usePool) {
				userEmit("setdeck", { d: etg.encodedeck(editordeck), number: user.selectedDeck });
				user.deck = editordeck;
			}
			startMenu();
		}
		bimport.click = function() {
			editordeck = deckimport.value.split(" ");
			processDeck();
		}
		bdeck1.click = function () {
		    editordeck.push(TrueMarks[editormark]);
		    userEmit("setdeck", { d: etg.encodedeck(editordeck), number: user.selectedDeck });
		    user.selectedDeck = 1;
		    editordeck = getDeck();
		    processDeck();
		}
		bdeck2.click = function () {
		    editordeck.push(TrueMarks[editormark]);
		    userEmit("setdeck", { d: etg.encodedeck(editordeck), number: user.selectedDeck });
		    user.selectedDeck = 2;
		    editordeck = getDeck();
		    processDeck();
		}
		bdeck3.click = function () {
		    editordeck.push(TrueMarks[editormark]);
		    userEmit("setdeck", { d: etg.encodedeck(editordeck), number: user.selectedDeck });
		    user.selectedDeck = 3;
		    editordeck = getDeck();
		    processDeck();
		}
		barena.click = function() {
			if (editordeck.length < 30) {
				chatArea.value = "30 cards required before submission";
				return;
			}
			if (usePool) {
				editordeck.push(TrueMarks[editormark]);
				userEmit("setarena", { d: etg.encodedeck(editordeck) });
				editordeck.pop();
				chatArea.value = "Arena deck submitted";
			}
		}
		editorui.addChild(bclear);
		editorui.addChild(bsave);
		editorui.addChild(bimport);
		if (usePool) {
		    editorui.addChild(bdeck1);
		    editorui.addChild(bdeck2);
		    editorui.addChild(bdeck3);
		}
		if (usePool && user.ocard) {
			editorui.addChild(barena);
		}
		var editorcolumns = [];
		var editordecksprites = [];
		var editordeck = getDeck();
		var editormarksprite = new PIXI.Sprite(nopic);
		editormarksprite.position.set(100, 210);
		editorui.addChild(editormarksprite);
		var editormark = 0;
		processDeck();
		var editoreleicons = [];
		for (var i = 0;i < 13;i++) {
			var sprite = new PIXI.Sprite(nopic);
			sprite.position.set(8, 184 + i * 32);
			var marksprite = new PIXI.Sprite(nopic);
			marksprite.position.set(200 + i * 32, 210);
			setInteractive(sprite, marksprite);
			(function(_i) {
				sprite.click = function() { editorelement = _i; }
				marksprite.click = function() { editormark = _i; }
			})(i);
			editoreleicons.push([sprite, marksprite]);
			editorui.addChild(sprite);
			editorui.addChild(marksprite);
		}
		for (var i = 0;i < 60;i++) {
			var sprite = new PIXI.Sprite(nopic);
			sprite.position.set(100 + Math.floor(i / 10) * 100, 8 + (i % 10) * 20);
			(function(_i) {
				sprite.click = function() {
					var card = CardCodes[editordeck[_i]];
					if (usePool && !isFreeCard(card)) {
						adjustCardMinus(editordeck[_i], -1);
					}
					editordeck.splice(_i, 1);
				}
				sprite.mouseover = function() {
					cardartcode = editordeck[_i];
				}
			})(i);
			sprite.interactive = true;
			editorui.addChild(sprite);
			editordecksprites.push(sprite);
		}
		for (var i = 0;i < 6;i++) {
			editorcolumns.push([[], []]);
			for (var j = 0;j < 15;j++) {
				var sprite = new PIXI.Sprite(nopic);
				sprite.position.set(100 + i * 130, 272 + j * 20);
				if (usePool) {
					var sprcount = new PIXI.Text("", { font: "12px Dosis" });
					sprcount.position.set(102, 4);
					sprite.addChild(sprcount);
				}
				(function(_i, _j) {
					sprite.click = function() {
						if (editordeck.length < 60) {
							var code = editorcolumns[_i][1][editorelement][_j], card = CardCodes[code];
							if (usePool && !isFreeCard(card)) {
								if (!(code in cardpool) || (code in cardminus && cardminus[code] >= cardpool[code]) ||
                                    (CardCodes[code].type != PillarEnum && (cardminus[card.asUpped(false).code] || 0) + (cardminus[card.asUpped(true).code] || 0) >= 6)) {
									return;
								}
								adjustCardMinus(code, 1);
							}
							for (var i = 0;i < editordeck.length;i++) {
								var cmp = editorCardCmp(editordeck[i], code);
								if (cmp >= 0) break;
							}
							editordeck.splice(i, 0, code);
						}
					}
					sprite.mouseover = function() {
						cardartcode = editorcolumns[_i][1][editorelement][_j];
					}
				})(i, j);
				sprite.interactive = true;
				editorui.addChild(sprite);
				editorcolumns[i][0].push(sprite);
			}
			for (var j = 0;j < 13;j++) {
				editorcolumns[i][1].push(filtercards(i > 2,
                    function(x) { return x.element == j && ((i % 3 == 0 && x.type == CreatureEnum) || (i % 3 == 1 && x.type <= PermanentEnum) || (i % 3 == 2 && x.type == SpellEnum)); },
                    editorCardCmp));
			}
		}
		var cardArt = new PIXI.Sprite(nopic);
		cardArt.position.set(734, 8);
		editorui.addChild(cardArt);
		animCb = function() {
			editormarksprite.setTexture(getIcon(editormark));
			if (cardartcode) {
				cardArt.setTexture(getArt(cardartcode));
			}
			for (var i = 0;i < 13;i++) {
				for (var j = 0;j < 2;j++) {
					editoreleicons[i][j].setTexture(getIcon(i));
				}
			}
			for (var i = 0;i < editordeck.length;i++) {
				editordecksprites[i].visible = true;
				editordecksprites[i].setTexture(getCardImage(editordeck[i]));
			}
			for (;i < 60;i++) {
				editordecksprites[i].visible = false;
			}
			for (var i = 0;i < 6;i++) {
				for (var j = 0;j < editorcolumns[i][1][editorelement].length;j++) {
					var spr = editorcolumns[i][0][j], code = editorcolumns[i][1][editorelement][j], card = CardCodes[code];
					if (!usePool || card in cardpool || isFreeCard(card)) spr.visible = true;
					else spr.visible = false;
					spr.setTexture(getCardImage(code));
					if (usePool) {
						var txt = spr.getChildAt(0), card = CardCodes[code], inf = isFreeCard(card);
						if ((txt.visible = inf || code in cardpool)) {
							maybeSetText(txt, inf ? "-" : (cardpool[code] - (code in cardminus ? cardminus[code] : 0)).toString());
						}
					}
				}
				for (;j < 15;j++) {
					editorcolumns[i][0][j].visible = false;
				}
			}
		}
		mainStage = editorui;
		refreshRenderer();
	}
}
var descr = [
        "Chroma",
        "Entropy",
        "Death",
        "Gravity",
        "Earth",
        "Life",
        "Fire",
        "Water",
        "Light",
        "Air",
        "Time",
        "Darkness",
        "Aether"
];
function startElementSelect() {
	var stage = new PIXI.Stage(0x336699, true);
	chatArea.value = "Select your starter element";
	var elesel = [];
	var eledesc = new PIXI.Text("", { font: "24px Dosis" });
	eledesc.position.set(100, 250);
	stage.addChild(eledesc);
	for (var i = 0;i < 13;i++) {
		elesel[i] = new PIXI.Sprite(nopic);
		elesel[i].position.set(100 + i * 32, 300);
		(function(_i) {
			elesel[_i].mouseover = function() {
				maybeSetText(eledesc, descr[_i]);
			}
			elesel[_i].click = function() {
				var msg = { u: user.name, a: user.auth, e: _i };
				user = undefined;
				socket.emit("inituser", msg);
				startMenu();
			}
		})(i);
		elesel[i].interactive = true;
		stage.addChild(elesel[i]);
	}
	animCb = function() {
		for (var i = 0;i < 13;i++) {
			elesel[i].setTexture(getIcon(i));
		}
	}
	mainStage = stage;
	refreshRenderer();
}

function startMatch() {
	if (anims.length) {
		while (anims.length) {
			anims[0].remove();
		}
	}
	player2summon = function(cardinst) {
		var card = cardinst.card;
		var sprite = new PIXI.Sprite(nopic);
		sprite.position.set((foeplays.length % 9) * 100, Math.floor(foeplays.length / 9) * 20);
		gameui.addChild(sprite);
		foeplays.push([card, sprite]);
	}
	function drawBorder(obj, spr) {
		if (obj) {
			if (targetingMode) {
				if (targetingMode(obj)) {
					fgfx.lineStyle(2, 0xff0000);
					fgfx.drawRect(spr.position.x - spr.width / 2, spr.position.y - spr.height / 2, spr.width, spr.height);
					fgfx.lineStyle(2, 0xffffff);
				}
			} else if (obj.canactive()) {
				fgfx.lineStyle(2, obj.card.element ==  8 ?  0x000000 : 0xffffff );
				fgfx.drawRect(spr.position.x - spr.width / 2, spr.position.y - spr.height / 2, spr.width, (obj instanceof Weapon || obj instanceof Shield ? 8 : 10));
			}
		}
	}
	function drawStatus(obj, spr) {
		var x = spr.position.x, y = spr.position.y, wid = spr.width, hei = spr.height;
		if (obj == obj.owner.gpull) {
			fgfx.beginFill(0xffaa00, .3);
			fgfx.drawRect(x - wid / 2 - 2, y - hei / 2 - 2, wid + 4, hei + 4);
			fgfx.endFill();
		}
		if (obj.status.frozen) {
			fgfx.beginFill(0x0000ff, .3);
			fgfx.drawRect(x - wid / 2 - 2, y - hei / 2 - 2, wid + 4, hei + 4);
			fgfx.endFill();
		}
		if (obj.status.delayed) {
			fgfx.beginFill(0xffff00, .3);
			fgfx.drawRect(x - wid / 2 - 2, y - hei / 2 - 2, wid + 4, hei + 4);
			fgfx.endFill();
		}
		fgfx.lineStyle(1, 0);
		if (obj.passives.airborne || obj.passives.ranged) {
			fgfx.beginFill(elecols[Air], .8);
			fgfx.drawRect(x - wid / 2 - 2, y + hei / 2 - 10, 12, 12);
			fgfx.endFill();
		}
		if (obj.status.adrenaline) {
			fgfx.beginFill(elecols[Life], .8);
			fgfx.drawRect(x - wid / 2 + 6, y + hei / 2 - 10, 12, 12);
			fgfx.endFill();
		}
		if (obj.status.momentum) {
			fgfx.beginFill(elecols[Gravity], .8);
			fgfx.drawRect(x - wid / 2 + 14, y + hei / 2 - 10, 12, 12);
			fgfx.endFill();
		}
		if (obj.status.psion) {
			fgfx.beginFill(elecols[Aether], .8);
			fgfx.drawRect(x - wid / 2 + 22, y + hei / 2 - 10, 12, 12);
			fgfx.endFill();
		}
		if (obj.status.burrowed) {
			fgfx.beginFill(elecols[Earth], .8);
			fgfx.drawRect(x - wid / 2 + 30, y + hei / 2 - 10, 12, 12);
			fgfx.endFill();
		}
		if (obj.status.poison) {
			fgfx.beginFill(obj.aflatoxin ? elecols[Darkness] : obj.status.poison > 0 ? elecols[Death] : elecols[Water], .8);
			fgfx.drawRect(x - wid / 2 + 38, y + hei / 2 - 10, 12, 12);
			fgfx.endFill();
		}
		fgfx.lineStyle(0, 0, 0);
		spr.alpha = obj.status.immaterial || obj.status.burrowed ? .7 : 1;
	}
	var cardwon;
	animCb = function() {
		if (game.phase == PlayPhase && game.turn == game.player2 && game.player2.ai && --aiDelay <= 0) {
			aiDelay = parseInt(airefresh.value) || 8;
			if (aiDelay == -2) {
				disableEffects = true;
			}
			do {
				var cmd = game.player2.ai();
				cmds[cmd[0]](cmd[1]);
			} while (aiDelay < 0 && game.turn == game.player2);
			disableEffects = false;
		}
		var pos = gameui.interactionManager.mouse.global;
		maybeSetText(winnername, game.winner ? (game.winner == game.player1 ? "Won " : "Lost ") + game.ply : "");
		maybeSetButton(game.winner ? null : endturn, endturn);
		if (!game.winner || !user) {
			var cardartcode;
			setInfo();
			for (var i = 0;i < foeplays.length;i++) {
				if (hitTest(foeplays[i][1], pos)) {
					cardartcode = foeplays[i][0].code;
					setInfo(foeplays[i][0]);
				}
			}
			for (var j = 0;j < 2;j++) {
				var pl = game.players[j];
				if (j == 0 || game.player1.precognition) {
					for (var i = 0;i < pl.hand.length;i++) {
						if (hitTest(handsprite[j][i], pos)) {
							cardartcode = pl.hand[i].card.code;
							setInfo(pl.hand[i].card);
						}
					}
				}
				if (j == 0 || !(cloakgfx.visible)) {
					for (var i = 0;i < 23;i++) {
						var cr = pl.creatures[i];
						if (cr && hitTest(creasprite[j][i], pos)) {
							cardartcode = cr.card.code;
							setInfo(cr);
						}
					}
					for (var i = 0;i < 16;i++) {
						var pr = pl.permanents[i];
						if (pr && hitTest(permsprite[j][i], pos)) {
							cardartcode = pr.card.code;
							setInfo(pr);
						}
					}
					if (pl.weapon && hitTest(weapsprite[j], pos)) {
						cardartcode = pl.weapon.card.code;
						setInfo(pl.weapon);
					}
					if (pl.shield && hitTest(shiesprite[j], pos)) {
						cardartcode = pl.shield.card.code;
						setInfo(pl.shield);
					}
				}
			}
			if (cardartcode) {
				cardart.setTexture(getArt(cardartcode));
				cardart.visible = true;
				cardart.position.y = pos.y > 300 ? 44 : 300;
			} else cardart.visible = false;
		} else {
			if (game.winner == game.player1 && !game.quest && game.player2.ai) {
				if (!cardwon) {
					var winnable = [];
					for (var i = 0;i < foeDeck.length;i++) {
						if (foeDeck[i].type != PillarEnum && foeDeck[i].rarity < 4) {
							winnable.push(foeDeck[i]);
						}
					}
					if (winnable.length) {
						cardwon = winnable[Math.floor(Math.random() * winnable.length)];
						if (cardwon.rarity == 3 && Math.random() < .5)
							cardwon = winnable[Math.floor(Math.random() * winnable.length)];
					} else {
						var elewin = foeDeck[Math.floor(Math.random() * foeDeck.length)];
						rareAllowed = 3;
						cardwon = PlayerRng.randomcard(elewin.upped, function(x) { return x.element == elewin.element && x.type != PillarEnum && x.rarity <= rareAllowed; });
					}
					if (game.level && game.level < 3) {
						cardwon = cardwon.asUpped(false);
					}
					if (game.gold) {
						var goldwon = Math.floor(game.gold * (game.player1.hp == game.player1.maxhp ? 2 : .5 + game.player1.hp / (game.player1.maxhp * 2)));
						console.log(goldwon);
						if (game.cost) goldwon += game.cost;
						game.goldreward = goldwon;
					}
					cardart.visible = false;
					game.cardreward = cardwon.code;
				}
			} else {
				cardart.visible = false;
			}
		}
		if (game.phase != EndPhase) {
			cancel.visible = true;
			var endturnButton = accepthand.visible ? accepthand : (endturn.visible ? endturn : null);
			var cancelButton = mulligan.visible ? mulligan : (cancel.visible ? cancel : null);
			maybeSetButton(endturnButton, game.turn == game.player1 ? (game.phase == PlayPhase ? endturn : accepthand) : null);
			maybeSetButton(cancelButton, game.turn == game.player1 ? (game.phase != PlayPhase ? mulligan : (targetingMode || discarding) ? cancel : null) : null);
		}
		maybeSetText(turntell, discarding ? "Discard" : targetingMode ? targetingText : game.turn == game.player1 ? "Your Turn" : "Their Turn");
		for (var i = 0;i < foeplays.length;i++) {
			maybeSetTexture(foeplays[i][1], getCardImage(foeplays[i][0].code));
		}
		cloakgfx.visible = game.player2.isCloaked();
		fgfx.clear();
		if (game.turn == game.player1 && !targetingMode && game.phase != EndPhase) {
			for (var i = 0;i < game.player1.hand.length;i++) {
				var card = game.player1.hand[i].card;
				if (game.player1.canspend(card.costele, card.cost)) {
					fgfx.beginFill(elecols[card.costele]);
					fgfx.drawRect(handsprite[0][i].position.x + 100, handsprite[0][i].position.y, 20, 20);
					fgfx.endFill();
				}
			}
		}
		fgfx.beginFill(0, 0);
		fgfx.lineStyle(2, 0xffffff);
		for (var j = 0;j < 2;j++) {
			for (var i = 0;i < 23;i++) {
				drawBorder(game.players[j].creatures[i], creasprite[j][i]);
			}
			for (var i = 0;i < 16;i++) {
				drawBorder(game.players[j].permanents[i], permsprite[j][i]);
			}
			drawBorder(game.players[j].weapon, weapsprite[j]);
			drawBorder(game.players[j].shield, shiesprite[j]);
		}
		if (targetingMode) {
			fgfx.lineStyle(2, 0xff0000);
			for (var j = 0;j < 2;j++) {
				if (targetingMode(game.players[j])) {
					var spr = hptext[j];
					fgfx.drawRect(spr.position.x - spr.width / 2, spr.position.y - spr.height / 2, spr.width, spr.height);
				}
				for (var i = 0;i < game.players[j].hand.length;i++) {
					if (targetingMode(game.players[j].hand[i])) {
						var spr = handsprite[j][i];
						fgfx.drawRect(spr.position.x, spr.position.y, spr.width, spr.height);
					}
				}
			}
		}
		fgfx.lineStyle(0, 0, 0);
		fgfx.endFill();
		for (var j = 0;j < 2;j++) {
			if (game.players[j].sosa) {
				fgfx.beginFill(elecols[Death], .5);
				var spr = hptext[j];
				fgfx.drawRect(spr.position.x - spr.width / 2, spr.position.y - spr.height / 2, spr.width, spr.height);
				fgfx.endFill();
			}
			if (game.players[j].flatline) {
				fgfx.beginFill(elecols[Death], .3);
				fgfx.drawRect(handsprite[j][0].position.x - 2, handsprite[j][0].position.y - 2, 124, 164);
				fgfx.endFill();
			}
			if (game.players[j].silence) {
				fgfx.beginFill(elecols[Aether], .3);
				fgfx.drawRect(handsprite[j][0].position.x - 2, handsprite[j][0].position.y - 2, 124, 164);
				fgfx.endFill();
			} else if (game.players[j].sanctuary) {
				fgfx.beginFill(elecols[Light], .3);
				fgfx.drawRect(handsprite[j][0].position.x - 2, handsprite[j][0].position.y - 2, 124, 164);
				fgfx.endFill();
			}
			for (var i = 0;i < 8;i++) {
				maybeSetTexture(handsprite[j][i], getCardImage(game.players[j].hand[i] ? (j == 0 || game.player1.precognition ? game.players[j].hand[i].card.code : "0") : "1"));
			}
			for (var i = 0;i < 23;i++) {
				var cr = game.players[j].creatures[i];
				if (cr && !(j == 1 && cloakgfx.visible)) {

					creasprite[j][i].setTexture(getCreatureImage(cr.card));
					creasprite[j][i].visible = true;
					var child = creasprite[j][i].getChildAt(0);
					child.visible = true;
					child.setTexture(getTextImage(cr.trueatk() + "|" + cr.truehp(), 10, cr.card.upped ? "black" : "white"));
					var child2 = creasprite[j][i].getChildAt(1);
					var activetext = cr.active.cast ? casttext(cr.cast, cr.castele) + cr.active.cast.activename : (cr.active.hit ? cr.active.hit.activename : "");
					child2.setTexture(getTextImage(activetext, 8, cr.card.upped ? "black" : "white"), 0.6);
					drawStatus(cr, creasprite[j][i]);
				} else creasprite[j][i].visible = false;
			}
			for (var i = 0;i < 16;i++) {
				var pr = game.players[j].permanents[i];
				if (pr && !(j == 1 && cloakgfx.visible && !pr.passives.cloak)) {
					permsprite[j][i].setTexture(getPermanentImage(pr.card.code));
					permsprite[j][i].visible = true;
					permsprite[j][i].alpha = pr.status.immaterial ? .7 : 1;
					var child = permsprite[j][i].getChildAt(0);
					child.visible = true;
					if (pr instanceof Pillar) {
						child.setTexture(getTextImage("1:" + (pr.active.auto == Actives.pend && pr.pendstate ? pr.owner.mark : pr.card.element) + " x" + pr.status.charges, 10, pr.card.upped ? "black" : "white"),0.8);
					}
					else child.setTexture(getTextImage(pr.status.charges !== undefined ? " " + pr.status.charges : ""));
					var child2 = permsprite[j][i].getChildAt(1);
					if (!(pr instanceof Pillar)) {
						child2.setTexture(getTextImage(pr.activetext().replace(" losecharge", ""), 8, pr.card.upped ? "black" : "white"), 0.6);
					}
					else
						child2.setTexture(nopic);
				} else permsprite[j][i].visible = false;
			}
			var wp = game.players[j].weapon;
			if (wp && !(j == 1 && cloakgfx.visible)) {
				weapsprite[j].visible = true;
				var child = weapsprite[j].getChildAt(0);
				child.setTexture(getTextImage(wp.activetext(), 12, wp.card.upped ? "black" : "white"));
				child.visible = true;
				var child2 = weapsprite[j].getChildAt(1);
				child2.setTexture(getTextImage(wp.trueatk() + "", 12, wp.card.upped ? "black" : "white"));
				child2.visible = true;
				weapsprite[j].setTexture(getWeaponShieldImage(wp.card.code));
				drawStatus(wp, weapsprite[j]);
			} else weapsprite[j].visible = false;
			var sh = game.players[j].shield;
			if (sh && !(j == 1 && cloakgfx.visible)) {
				shiesprite[j].visible = true;
				var dr = sh.truedr();
				var child = shiesprite[j].getChildAt(0);
				child.visible = true;
				child.setTexture(getTextImage((sh.active.shield ? " " + sh.active.shield.activename : "") + (sh.active.buff ? " " + sh.active.buff.activename : "") + (sh.active.cast ? casttext(sh.cast, sh.castele) + sh.active.cast.activename : ""), 12, sh.card.upped ? "black" : "white"));
				var child2 = shiesprite[j].getChildAt(1);
				child2.setTexture(getTextImage(sh.status.charges ? "x" + sh.status.charges: "" + sh.truedr() + "", 12, sh.card.upped ? "black" : "white"));
				child2.visible = true;
				shiesprite[j].alpha = sh.status.immaterial ? .7 : 1;
				shiesprite[j].setTexture(getWeaponShieldImage(sh.card.code));
			} else shiesprite[j].visible = false;
			marksprite[j].setTexture(getIcon(game.players[j].mark));
			for (var i = 1;i < 13;i++) {
				maybeSetText(quantatext[j].getChildAt(i - 1), game.players[j].quanta[i].toString());
			}
			for (var i = 1;i < 13;i++) {
				quantatext[j].getChildAt(i + 12 - 1).setTexture(getIcon(i));
			}
			maybeSetText(hptext[j], game.players[j].hp + "/" + game.players[j].maxhp);
			maybeSetText(poisontext[j], game.players[j].status.poison + (game.players[j].neuro ? "psn!" : "psn"));
			maybeSetText(decktext[j], game.players[j].deck.length + "cards");
			maybeSetText(damagetext[j], game.players[j].foe.expectedDamage ? "Next HP-loss:" + game.players[j].foe.expectedDamage : "");
		}
	}
	gameui = new PIXI.Stage(0x336699, true);
	var cloakgfx = new PIXI.Graphics();
	var bggame = new PIXI.Sprite(backgrounds[4]);
	gameui.addChild(bggame);
	cloakgfx.beginFill(0);
	cloakgfx.drawRect(130, 20, 660, 280);
	cloakgfx.endFill();
	gameui.addChild(cloakgfx);
	var winnername = new PIXI.Text("", { font: "16px Dosis" });
	winnername.position.set(800, 540);
	gameui.addChild(winnername);
	var endturn = makeButton(800, 540, 75, 18, buttons.endturn);
	var accepthand = makeButton(800, 540, 75, 18, buttons.accepthand);
	var cancel = makeButton(800, 500, 75, 18, buttons.cancel);
	var mulligan = makeButton(800, 500, 75, 18, buttons.mulligan);
	var resign = makeButton(8, 24, 75, 18, buttons.resign);
	var confirm = makeButton(8, 24, 75, 18, buttons.confirm);
	gameui.addChild(endturn);
	gameui.addChild(cancel);
	gameui.addChild(mulligan);
	gameui.addChild(accepthand);
	gameui.addChild(resign);
	gameui.addChild(confirm);
	confirm.visible = cancel.visible = endturn.visible = false;
	var turntell = new PIXI.Text("", { font: "16px Dosis" });
	var infotext = new PIXI.Sprite(nopic);
	var foename = new PIXI.Text(game.foename || "Unknown Opponent", { font: "bold 18px Dosis", align: "center" });
	foename.position.set(25, 75);
	gameui.addChild(foename);
	endturnFunc = endturn.click = function(e, discard) {
		if (game.winner) {
			for (var i = 0;i < foeplays.length;i++) {
				if (foeplays[i][1].parent) {
					foeplays[i][1].parent.removeChild(foeplays[i][1]);
				}
			}
			foeplays.length = 0;
			if (user && game.arena) {
				userEmit("modarena", { aname: game.arena, won: game.winner == game.player2 });
				delete game.arena;
			}
			if (user && game.quest) {
				if (game.winner == game.player1 && (user.quest[game.quest[0]] <= game.quest[1] || !(game.quest[0] in user.quest))) {
					userEmit("updatequest", { quest: game.quest[0], newstage: game.quest[1] + 1 });
					user.quest[game.quest[0]] = game.quest[1] + 1;
				}
			}
			if (user && game.winner == game.player1) {
				victoryScreen();
			}
			else {
				if (game.quest)
					startQuestWindow();
				else
					startMenu();
				game = undefined;
			}
		} else if (game.turn == game.player1) {

			if (discard == undefined && game.player1.hand.length == 8) {
				discarding = true;
			} else {
				discarding = false;
				if (!game.player2.ai) {
					socket.emit("endturn", discard);
				}
				game.player1.endturn(discard);
				targetingMode = undefined;
				for (var i = 0;i < foeplays.length;i++) {
					if (foeplays[i][1].parent) {
						foeplays[i][1].parent.removeChild(foeplays[i][1]);
					}
				}
				foeplays.length = 0;
			}
		}
	}
	accepthandfunc = accepthand.click = function() {
		if (!game.player2.ai) {
			socket.emit("mulligan", true);
		}
		progressMulligan(game);
		if (game.phase == MulliganPhase2 && game.player2.ai) {
			progressMulligan(game);
		}
	}
	cancelFunc = cancel.click = function() {
		if (resigning) {
			maybeSetButton(confirm, resign);
			resigning = false;
		} else if (game.turn == game.player1) {
			if (targetingMode) {
				targetingMode = targetingModeCb = null;
			} else if (discarding) {
				discarding = false;
			}
		}
	}
	mulligan.click = function() {
		if ((game.phase == MulliganPhase1 || game.phase == MulliganPhase2) && game.turn == game.player1 && game.player1.hand.length > 0) {
			game.player1.drawhand(game.player1.hand.length - 1);
			socket.emit("mulligan");
		}
	}
	var resigning;
	resign.click = function() {
		maybeSetButton(resign, confirm);
		resigning = true;
	}
	confirm.click = function() {
		if (!game.player2.ai) {
			socket.emit("foeleft");
		}
		startMenu();
	}

	turntell.position.set(800, 570);
	gameui.addChild(turntell);
	infotext.position.set(100, 584);
	gameui.addChild(infotext);
	function setInfo(obj) {
		if (obj && !(obj.owner == game.player2 && cloakgfx.visible)) {
			infotext.setTexture(getTextImage(obj.info(), 16));
			if (obj.card) {
				setInfoBox(obj);
			}
		}
		else {
			infotext.setTexture(nopic);
			infobox.setTexture(nopic);
		}
	}
	function setInfoBox(obj) {
		var rend = new PIXI.RenderTexture((obj instanceof Weapon || obj instanceof Shield ? 80 : 64)+12, 200);
		var graphics = new PIXI.Graphics();
		var words = obj.info().split(" ");
		var x = 2, y = 2;
		var template = new PIXI.Graphics();
		for (var i = 0;i < words.length;i++) {
			var wordgfx = new PIXI.Sprite(getTextImage(words[i], 10,"white"));
			if (x + wordgfx.width > rend.width - 2) {
				x = 2;
				y += 12;
			}
			wordgfx.position.set(x, y);
			x += wordgfx.width + 3;
			template.addChild(wordgfx);
		}
		graphics.beginFill("black", 0.7);
		graphics.drawRect(0, 0, rend.width, y+12);
		graphics.endFill();
		graphics.addChild(template);
		rend.render(graphics);
		infobox.setTexture(rend);
		infobox.anchor.set(0.5, 0);
		infobox.position.set(gameui.getMousePosition().x, gameui.getMousePosition().y-(y+10));
		infobox.visible = true;
	}
	var handsprite = [new Array(8), new Array(8)];
	var creasprite = [new Array(23), new Array(23)];
	var permsprite = [new Array(16), new Array(16)];
	var weapsprite = [new PIXI.Sprite(nopic), new PIXI.Sprite(nopic)];
	var shiesprite = [new PIXI.Sprite(nopic), new PIXI.Sprite(nopic)];
	var marksprite = [new PIXI.Sprite(nopic), new PIXI.Sprite(nopic)];
	var quantatext = [new PIXI.DisplayObjectContainer(), new PIXI.DisplayObjectContainer()];
	var hptext = [new PIXI.Text("", { font: "18px Dosis" }), new PIXI.Text("", { font: "18px Dosis" })];
	var damagetext = [new PIXI.Text("", { font: "14px Dosis" }), new PIXI.Text("", { font: "14px Dosis" })];
	var poisontext = [new PIXI.Text("", { font: "16px Dosis" }), new PIXI.Text("", { font: "16px Dosis" })];
	var decktext = [new PIXI.Text("", { font: "16px Dosis" }), new PIXI.Text("", { font: "16px Dosis" })];
	for (var j = 0;j < 2;j++) {
		(function(_j) {
			for (var i = 0;i < 8;i++) {
				handsprite[j][i] = new PIXI.Sprite(nopic);
				handsprite[j][i].position.set(j ? 20 : 780, (j ? 130 : 310) + 20 * i);
				(function(_i) {
					handsprite[j][i].click = function() {
						if (game.phase != PlayPhase) return;
						var cardinst = game.players[_j].hand[_i];
						if (cardinst) {
							if (!_j && discarding) {
								endturn.click(null, _i);
							} else if (targetingMode) {
								if (targetingMode(cardinst)) {
									targetingMode = undefined;
									targetingModeCb(cardinst);
								}
							} else if (!_j && cardinst.canactive()) {
								if (cardinst.card.type != SpellEnum) {
									console.log("summoning " + _i);
									socket.emit("cast", tgtToBits(cardinst));
									cardinst.useactive();
								} else {
									getTarget(cardinst, cardinst.card.active, function(tgt) {
										socket.emit("cast", tgtToBits(cardinst) | tgtToBits(tgt) << 9);
										cardinst.useactive(tgt);
									});
								}
							}
						}
					}
				})(i);
				gameui.addChild(handsprite[j][i]);
			}
			for (var i = 0;i < 23;i++) {
				creasprite[j][i] = new PIXI.Sprite(nopic);
				var stattext = new PIXI.Sprite(nopic);
				stattext.position.set(-31, -32);
				var activetext = new PIXI.Sprite(nopic);
				activetext.position.set(-31, -42);
				creasprite[j][i].addChild(stattext);
				creasprite[j][i].addChild(activetext);
				creasprite[j][i].anchor.set(.5, .5);
				creasprite[j][i].position = creaturePos(j, i);
				(function(_i) {
					creasprite[j][i].click = function() {
						if (game.phase != PlayPhase) return;
						var crea = game.players[_j].creatures[_i];
						if (!crea) return;
						if (targetingMode && targetingMode(crea)) {
							targetingMode = undefined;
							targetingModeCb(crea);
						} else if (_j == 0 && !targetingMode && crea.canactive()) {
							getTarget(crea, crea.active.cast, function(tgt) {
								targetingMode = undefined;
								socket.emit("cast", tgtToBits(crea) | tgtToBits(tgt) << 9);
								crea.useactive(tgt);
							});
						}
					}
				})(i);
				gameui.addChild(creasprite[j][i]);
			}
			for (var i = 0;i < 16;i++) {
				permsprite[j][i] = new PIXI.Sprite(nopic);
				var permtext = new PIXI.Sprite(nopic);
				permtext.position.set(-31, -32);
				var activetext = new PIXI.Sprite(nopic);
				activetext.position.set(-31, -42);
				permsprite[j][i].addChild(permtext);
				permsprite[j][i].addChild(activetext);
				permsprite[j][i].anchor.set(.5, .5);
				permsprite[j][i].position = permanentPos(j, i);
				(function(_i) {
					permsprite[j][i].click = function() {
						if (game.phase != PlayPhase) return;
						var perm = game.players[_j].permanents[_i];
						if (!perm) return;
						if (targetingMode && targetingMode(perm)) {
							targetingMode = undefined;
							targetingModeCb(perm);
						} else if (_j == 0 && !targetingMode && perm.canactive()) {
							getTarget(perm, perm.active.cast, function(tgt) {
								targetingMode = undefined;
								socket.emit("cast", tgtToBits(perm) | tgtToBits(tgt) << 9);
								perm.useactive(tgt);
							});
						}
					}
				})(i);
				gameui.addChild(permsprite[j][i]);
			}
			setInteractive.apply(null, handsprite[j]);
			setInteractive.apply(null, creasprite[j]);
			setInteractive.apply(null, permsprite[j]);
			weapsprite[j].anchor.set(.5, .5);
			shiesprite[j].anchor.set(.5, .5);
			marksprite[j].anchor.set(.5, .5);
			weapsprite[j].position.set(666, 512);
			shiesprite[j].position.set(710, 532);
			marksprite[j].position.set(750, 470);
			var weaptext = new PIXI.Sprite(nopic);
			weaptext.position.set(-40, -51);
			var atktext = new PIXI.Sprite(nopic);
			atktext.position.set(-39, -39);
			weapsprite[j].addChild(weaptext);
			weapsprite[j].addChild(atktext);
			var shietext = new PIXI.Text(nopic);
			shietext.position.set(-40, -51);
			var deftext = new PIXI.Sprite(nopic);
			deftext.position.set(-39, -39);
			shiesprite[j].addChild(shietext);
			shiesprite[j].addChild(deftext);
			weapsprite[j].click = function() {
				if (game.phase != PlayPhase) return;
				var weap = game.players[_j].weapon;
				if (!weap) return
				if (targetingMode && targetingMode(weap)) {
					targetingMode = undefined;
					targetingModeCb(weap);
				} else if (_j == 0 && !targetingMode && weap.canactive()) {
					getTarget(weap, weap.active.cast, function(tgt) {
						targetingMode = undefined;
						socket.emit("cast", tgtToBits(weap) | tgtToBits(tgt) << 9);
						weap.useactive(tgt);
					});
				}
			}
			shiesprite[j].click = function() {
				if (game.phase != PlayPhase) return;
				var shie = game.players[_j].shield;
				if (!shie) return
				if (targetingMode && targetingMode(shie)) {
					targetingMode = undefined;
					targetingModeCb(shie);
				} else if (_j == 0 && !targetingMode && shie.canactive()) {
					getTarget(shie, shie.active.cast, function(tgt) {
						targetingMode = undefined;
						socket.emit("cast", tgtToBits(shie) | tgtToBits(tgt) << 9);
						shie.useactive(tgt);
					});
				}
			}
			if (j) {
				reflectPos(weapsprite[j]);
				reflectPos(shiesprite[j]);
				reflectPos(marksprite[j]);
			}
			gameui.addChild(weapsprite[j]);
			gameui.addChild(shiesprite[j]);
			gameui.addChild(marksprite[j]);
			hptext[j].anchor.set(.5, .5);
			poisontext[j].anchor.set(.5, .5);
			decktext[j].anchor.set(.5, .5);
			damagetext[j].anchor.set(.5, .5);
			quantatext[j].position.set(j ? 792 : 0, j ? 100 : 308);
			hptext[j].position.set(50, 550);
			poisontext[j].position.set(50, 570);
			decktext[j].position.set(50, 530);
			damagetext[j].position.set(50, 510);
			if (j) {
				reflectPos(hptext[j]);
				reflectPos(poisontext[j]);
				reflectPos(decktext[j]);
				reflectPos(damagetext[j]);
			}
			var child;
			for (var k = 1;k < 13;k++) {
				quantatext[j].addChild(child = new PIXI.Text("", { font: "16px Dosis" }));
				child.position.set((k & 1) ? 32 : 86, Math.floor((k - 1) / 2) * 32 + 8);
			}
			for (var k = 1;k < 13;k++) {
				quantatext[j].addChild(child = new PIXI.Sprite(nopic));
				child.position.set((k & 1) ? 0 : 54, Math.floor((k - 1) / 2) * 32);
			}
			hptext[j].mouseover = function() {
				setInfo(game.players[_j]);
			}
			hptext[j].click = function() {
				if (game.phase != PlayPhase) return;
				if (targetingMode && targetingMode(game.players[_j])) {
					targetingMode = undefined;
					targetingModeCb(game.players[_j]);
				}
			}
		})(j);
		setInteractive.apply(null, weapsprite);
		setInteractive.apply(null, shiesprite);
		setInteractive.apply(null, hptext);
		gameui.addChild(quantatext[j]);
		gameui.addChild(hptext[j]);
		gameui.addChild(poisontext[j]);
		gameui.addChild(decktext[j]);
		gameui.addChild(damagetext[j]);
	}
	var infobox = new PIXI.Sprite(nopic);
	gameui.addChild(infobox);
	var fgfx = new PIXI.Graphics();
	gameui.addChild(fgfx);
	var cardart = new PIXI.Sprite(nopic);
	cardart.position.set(600, 300);
	gameui.addChild(cardart);
	mainStage = gameui;
	refreshRenderer();
}

function startArenaInfo(info) {
	if (!info) {
		chatArea.value = "You do not have an arena deck";
	}
	var stage = new PIXI.Stage(0x336699, true);
	var winloss = new PIXI.Text((info.win || 0) + " - " + (info.loss || 0), { font: "16px Dosis" });
	winloss.position.set(200, 200);
	stage.addChild(winloss);
	var bret = new PIXI.Text("Return", { font: "16px Dosis" });
	bret.position.set(200, 400);
	bret.interactive = true;
	bret.click = startMenu;
	stage.addChild(bret);
	var ocard = new PIXI.Sprite(nopic);
	ocard.position.set(600, 300);
	stage.addChild(ocard);
	animCb = function() {
		if (info.card) {
			ocard.setTexture(getArt(info.card));
		}
	}
	mainStage = stage;
	refreshRenderer();
}

function startArenaTop(info) {
	if (!info) {
		chatArea.value = "??";
	}
	var stage = new PIXI.Stage(0x336699, true);
	for (var i = 0;i < info.length;i++) {
		var infotxt = new PIXI.Text(info[i], { font: "16px Dosis" });
		infotxt.position.set(200, 100 + i * 20);
		stage.addChild(infotxt);
	}
	var bret = new PIXI.Text("Return", { font: "16px Dosis" });
	bret.position.set(200, 400);
	bret.interactive = true;
	bret.click = startMenu;
	stage.addChild(bret);
	mainStage = stage;
	refreshRenderer();
}

var foeplays = [];
var tximgcache = [];

function getTextImage(text, font, color, iconsize) {
	if (color === undefined) color = "black";
	if (!(font in tximgcache)) {
		tximgcache[font] = {};
	}
	if (!(text in tximgcache[font])) {
		tximgcache[font][text] = {};
	} else if (color in tximgcache[font][text]) {
		return tximgcache[font][text][color];
	}
	var fontprop = { font: font + "px Dosis", fill: color };
	var doc = new PIXI.DisplayObjectContainer();
	var pieces = text.replace(/\|/g, " | ").split(/(\d\d?:\d\d?)/);
	var x = 0;
	for (var i = 0;i < pieces.length;i++) {
		var piece = pieces[i];
		if (/^\d\d?:\d\d?$/.test(piece)) {
			var parse = piece.split(":");
			var num = parseInt(parse[0]);
			var icon = getIcon(parseInt(parse[1]));
			for (var j = 0;j < num;j++) {
				var spr = new PIXI.Sprite(icon);
				size = iconsize || 1;
				spr.scale.set(.375*size, .375*size);
				spr.position.x = x;
				x += 12;
				doc.addChild(spr);
			}
		} else {
			var txt = new PIXI.Text(piece, fontprop);
			txt.position.x = x;
			x += txt.width;
			doc.addChild(txt);
		}
	}
	var rtex = new PIXI.RenderTexture(x, 16);
	rtex.render(doc);
	return tximgcache[font][text][color] = rtex;
}

var cmds = {};
cmds.endturn = function(data) {
	game.player2.endturn(data);
}
cmds.cast = function(bits) {
	var c = bitsToTgt(bits & 511), t = bitsToTgt((bits >> 9) & 511);
	console.log("cast: " + c.card.name + " " + (t ? (t instanceof Player ? t == game.player1 : t.card.name) : "-"));
	if (c instanceof CardInstance) {
		player2summon(c);
	}
	c.useactive(t);
}
var socket = io.connect(location.hostname, { port: 13602 });
socket.on("pvpgive", initGame);
socket.on("tradegive", initTrade)
socket.on("foearena", function(data) {
	var deck = etg.decodedeck(data.deck);
	deck = doubleDeck(deck);
	chatArea.value = data.name + ": " + deck.join(" ");
	initGame({ first: data.first, deck: deck, urdeck: getDeck(), seed: data.seed, hp: data.hp, cost: data.cost, foename: data.name }, aievalopt.checked ? aiEvalFunc : aiFunc);
	game.arena = data.name;
	game.gold = 10;
	game.cost = 10;
});
socket.on("arenainfo", startArenaInfo);
socket.on("arenatop", startArenaTop);
socket.on("userdump", function(data) {
	user = data;
	if (user.deck) {
	    user.decks = [];
	    user.decks[1] = etg.decodedeck(user.deck1);
	    user.decks[2] = etg.decodedeck(user.deck2);
	    user.decks[3] = etg.decodedeck(user.deck3);
	    user.deck = getDeck()
		deckimport.value = user.deck.join(" ");
	}
	if (user.pool) {
		user.pool = etg.decodedeck(user.pool);
	}
	if (user.starter) {
	    user.starter = etg.decodedeck(user.starter);
	}
	if (user.accountbound) {
	    user.accountbound = etg.decodedeck(user.accountbound);
	}
	if (!user.quest)
	    user.quest = {};
	if (user.freepacks) {
	    user.freepacks = user.freepacks.split(",");
	    convertIntInList(user.freepacks);
	}
	convertQuest();
	startMenu();
});
socket.on("passchange", function(data) {
	user.auth = data;
	chatArea.value = "Password updated";
});
socket.on("endturn", cmds.endturn);
socket.on("cast", cmds.cast);
socket.on("foeleft", function(data) {
	if (game && !game.player2.ai) {
		setWinner(game, game.player1);
	}
});
socket.on("chat", function(data) {
	console.log("message gotten");
	var u = data.u ? data.u + ": " : "";
	var color = "black";
	if (data.mode) {
		if (data.mode == "pm") {
			color = "blue";
		}
		if (data.mode == "info")
			color = "red";
	}
	if (data.mode == "guest")
		chatBox.innerHTML += "<font color=black><i><b>" + u + "</b>" + data.message.replace(/</g, "&lt;").replace(/>/g, "&gt;") + "</i></font>";
	else
		chatBox.innerHTML += "<font color=" + color + "><b>" + u + "</b>" + data.message.replace(/</g, "&lt;").replace(/>/g, "&gt;") + "</font>";
	chatBox.innerHTML += "<br>";
	chatBox.scrollTop = chatBox.scrollHeight;
});
socket.on("mulligan", function(data) {
	if (data === true) {
		progressMulligan(game);
	} else {
		game.player2.drawhand(game.player2.hand.length - 1);
	}
});
socket.on("cardchosen", function(data) {
	player2Card = data.card;
	myTurn = true;
	console.log("Card recieved")
	console.log(player2Card);
});
socket.on("tradedone", function(data) {
	console.log("Trade done!")
	user.pool.push(data.newcard);
	user.pool.splice(user.pool.indexOf(data.oldcard), 1);
	startMenu();
});
socket.on("tradecanceled", function(data) {
	startMenu();
});
function maybeSendChat(e) {
	e.cancelBubble = true;
	if (e.keyCode != 13) return;
	if (chatinput.value) {
		if (user)
			userEmit("chat", { message: chatinput.value });
		else {
			if (!guestname) guestname = randomGuestName();
			var name = username.value ? username.value : guestname;

			socket.emit("guestchat", { message: chatinput.value, name: name });
		}
		chatinput.value = "";
	}
}
function randomGuestName() {
	res = "";
	for (var i = 0;i < 5;i++) {
		res += Math.floor(Math.random() * 10);
	}
	return res;
}
function maybeLogin(e) {
	e.cancelBubble = true;
	if (e.keyCode != 13) return;
	if (username.value) {
		loginClick();
	}
}
function maybeChallenge(e) {
	e.cancelBubble = true;
	if (e.keyCode != 13) return;
	if (foename.value) {
		challengeClick();
	}
}
function animate() {
	setTimeout(requestAnimate, 40);
	if (animCb) {
		animCb();
	}
	for (var i = anims.length - 1;i >= 0;i--) {
		anims[i].next();
	}
	renderer.render(mainStage);
}
function requestAnimate() { requestAnimFrame(animate); }
document.addEventListener("keydown", function(e) {
	if (mainStage == gameui) {
		if (e.keyCode == 32) {
			if (game.turn == game.player1 && (game.phase == MulliganPhase1 || game.phase == MulliganPhase2))
				accepthandfunc();
			else
				endturnFunc();
		} else if (e.keyCode == 8) {
			cancelFunc();
		} else return;
		e.preventDefault();
	}
});
document.addEventListener("click", function(e) {
	if (e.pageX < 900 && e.pageY < 600) {
		e.preventDefault();
	}
});
function convertQuest() {
	for (var q in user.quest) {
		q = parseInt(q);
	}
}
function convertIntInList(list) {
    for (var i = 0; i < list.length; i++) {
        list[i] = parseInt(list[i]);
    }
}
function loginClick() {
	if (!user) {
		var xhr = new XMLHttpRequest();
		xhr.open("POST", "auth?u=" + encodeURIComponent(username.value) + (password.value.length ? "&p=" + encodeURIComponent(password.value) : ""), true);
		xhr.onreadystatechange = function() {
			if (this.readyState == 4) {
				if (this.status == 200) {
					user = JSON.parse(this.responseText);
					if (!user) {
						chatArea.value = "No user";
					} else if (!user.pool && !user.starter) {
						startElementSelect();
					} else {
					    user.decks = [];
					    user.decks[1] = etg.decodedeck(user.deck1);
					    user.decks[2] = etg.decodedeck(user.deck2);
					    user.decks[3] = etg.decodedeck(user.deck3);
						user.deck = getDeck()
						deckimport.value = user.deck.join(" ");
						if (user.pool || user.pool == "") {
							user.pool = etg.decodedeck(user.pool);
						}
						if (user.starter) {
						    user.starter = etg.decodedeck(user.starter);
						}
						if (user.accountbound) {
						    user.accountbound = etg.decodedeck(user.accountbound);
						}
						if (!user.quest) {
							user.quest = {};
						}
						if (user.freepacks) {
						    user.freepacks = user.freepacks.split(",");
						    convertIntInList(user.freepacks);
						}
						console.log(user.quest);
						convertQuest();
						startMenu();
					}
				} else if (this.status == 404) {
					chatArea.value = "Incorrect password";
				} else if (this.status == 502) {
					chatArea.value = "Error verifying password";
				}
			}
		}
		xhr.send();
	}
}
function changeClick() {
	userEmit("passchange", { p: password.value });
}
function challengeClick() {
	if (Cards) {
		if (user && user.deck) {
			userEmit("foewant", { f: foename.value, deck: user.deck, DGmode:demigodmode.checked });
		} else {
			var deck = getDeck();
			if ((user && (!user.deck || user.deck.length < 31)) || deck.length < 11) {
				startEditor();
				return;
			}
			socket.emit("pvpwant", { deck: deck, room: foename.value, DGmode: demigodmode.checked });
		}
	}
}
function tradeClick() {
	if (Cards && user)
		userEmit("tradewant", { f: foename.value });
}