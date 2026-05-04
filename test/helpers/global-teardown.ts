export default async function globalTeardown(): Promise<void> {
  // Los schemas de test se limpian en el afterAll de cada spec file.
  // Este hook se reserva para cleanup global si se añade un pool compartido.
}
