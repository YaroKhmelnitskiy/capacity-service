import { JwtService } from '@nestjs/jwt';

const secret = process.env.JWT_SECRET;
if (!secret) {
  process.stderr.write('JWT_SECRET is required\n');
  process.exit(1);
}
const subject = process.argv[2] ?? 'local-client';
process.stdout.write(
  `${new JwtService({ secret }).sign({ sub: subject }, { algorithm: 'HS256', expiresIn: '12h' })}\n`,
);
