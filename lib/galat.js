'use strict';

/** Galat yang pesannya aman ditampilkan ke pengguna, beserta kode status HTTP-nya. */
class GalatMasukan extends Error {
  constructor(pesan, kode = 400) {
    super(pesan);
    this.kode = kode;
  }
}

function pastikan(syarat, pesan, kode) {
  if (!syarat) throw new GalatMasukan(pesan, kode);
}

module.exports = { GalatMasukan, pastikan };
