import * as path from 'path';
import * as dotenv from 'dotenv';

export default function globalSetup(): void {
  dotenv.config({ path: path.join(__dirname, '..', '.env.test') });
}
