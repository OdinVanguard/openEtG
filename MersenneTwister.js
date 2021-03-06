// Bastardized version of Raphael Pigulla's pure JavaScript MersenneTwister @ https://github.com/pigulla/mersennetwister

var MAX_INT = 4294967296,
	N = 624, M = 397,
	UPPER_MASK = 0x80000000,
	LOWER_MASK = 0x7fffffff,
	MAG_01 = [0, 0x9908b0df];

function MersenneTwister(seed) {
	this.mt = new Array(N);
	this.mti = N + 1;
	this.seed(seed);
};

MersenneTwister.prototype.seed = function (seed) {
	this.mt[0] = seed >>> 0;
	for (this.mti = 1; this.mti < N; this.mti++) {
		var s = this.mt[this.mti - 1] ^ (this.mt[this.mti - 1] >>> 30);
		this.mt[this.mti] =
			((((((s & 0xffff0000) >>> 16) * 1812433253) << 16) + (s & 0x0000ffff) * 1812433253) + this.mti) >>> 0;
	}
};

MersenneTwister.prototype.int = function () {
	var y;
	if (this.mti >= N) {
		for (var kk = 0; kk < N - M; kk++) {
			y = (this.mt[kk] & UPPER_MASK) | (this.mt[kk + 1] & LOWER_MASK);
			this.mt[kk] = this.mt[kk + M] ^ (y >>> 1) ^ MAG_01[y & 1];
		}

		for (; kk < N - 1; kk++) {
			y = (this.mt[kk] & UPPER_MASK) | (this.mt[kk + 1] & LOWER_MASK);
			this.mt[kk] = this.mt[kk + (M - N)] ^ (y >>> 1) ^ MAG_01[y & 1];
		}

		y = (this.mt[N - 1] & UPPER_MASK) | (this.mt[0] & LOWER_MASK);
		this.mt[N - 1] = this.mt[M - 1] ^ (y >>> 1) ^ MAG_01[y & 1];
		this.mti = 0;
	}
	y = this.mt[this.mti++];
	y ^= (y >>> 11);
	y ^= (y << 7) & 0x9d2c5680;
	y ^= (y << 15) & 0xefc60000;
	y ^= (y >>> 18);
	return y >>> 0;
};

MersenneTwister.prototype.int31 = function () {
	return this.int() >>> 1;
};

MersenneTwister.prototype.real = function () {
	return this.int() * (1.0 / (MAX_INT - 1));
};

MersenneTwister.prototype.realx = function () {
	return (this.int() + 0.5) * (1.0 / MAX_INT);
};

MersenneTwister.prototype.rnd = function () {
	return this.int() * (1.0 / MAX_INT);
};

MersenneTwister.prototype.rndHiRes = function () {
	var a = this.int() >>> 5,
		b = this.int() >>> 6;

	return (a * 67108864.0 + b) * (1.0 / 9007199254740992.0);
};

module.exports = MersenneTwister;