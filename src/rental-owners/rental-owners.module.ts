import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RentalOwnersService } from './rental-owners.service';
import { RentalOwnersController } from './rental-owners.controller';
import { RentalOwner } from '../properties/entities/rental-owner.entity';
import { PropertyOwner } from '../properties/entities/property-owner.entity';

@Module({
  imports: [TypeOrmModule.forFeature([RentalOwner, PropertyOwner])],
  providers: [RentalOwnersService],
  controllers: [RentalOwnersController],
  exports: [RentalOwnersService],
})
export class RentalOwnersModule {}
