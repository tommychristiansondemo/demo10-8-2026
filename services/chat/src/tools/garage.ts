/** "My Garage": the signed-in driver's vehicles (DynamoDB, partitioned by Cognito user id). */
import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'node:crypto';
import { ddb, TABLE } from '../clients.js';
import { canonicalModel, titleModel } from './models.js';

export interface Vehicle {
  vehicleId: string; nickname?: string; model: string; year: number; trim?: string; vin?: string;
  mileage?: number; inServiceDate?: string; certifiedPreOwned?: boolean; updatedAt?: string;
}

export async function listVehicles(userId: string): Promise<Vehicle[]> {
  const res = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
    ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'VEHICLE#' },
  }));
  return (res.Items || []).map(({ pk, sk, ...v }) => v as Vehicle);
}

export async function addVehicle(userId: string, input: {
  model: string; year: number; nickname?: string; trim?: string; vin?: string; current_mileage?: number;
  in_service_date?: string; certified_pre_owned?: boolean;
}) {
  const existing = await listVehicles(userId);
  if (existing.length >= 10) return { saved: false, message: 'Garage is limited to 10 vehicles.' };
  const v: Vehicle = {
    vehicleId: randomUUID(),
    model: titleModel(canonicalModel(input.model)),
    year: Number(input.year),
    nickname: input.nickname?.slice(0, 40),
    trim: input.trim?.slice(0, 40),
    vin: input.vin?.toUpperCase().slice(0, 17),
    mileage: input.current_mileage != null ? Math.round(Number(input.current_mileage)) : undefined,
    inServiceDate: input.in_service_date,
    certifiedPreOwned: input.certified_pre_owned,
    updatedAt: new Date().toISOString(),
  };
  await ddb.send(new PutCommand({ TableName: TABLE, Item: { pk: `USER#${userId}`, sk: `VEHICLE#${v.vehicleId}`, ...v } }));
  return { saved: true, vehicle: v };
}

export function describeGarage(vehicles: Vehicle[]) {
  if (!vehicles.length) return 'The driver has not saved any vehicles in My Garage yet.';
  return vehicles.map((v) => `- ${v.nickname ? `"${v.nickname}": ` : ''}${v.year} Nissan ${v.model}${v.trim ? ` ${v.trim}` : ''}`
    + `${v.mileage != null ? `, ${v.mileage.toLocaleString('en-US')} miles` : ''}`
    + `${v.inServiceDate ? `, in service since ${v.inServiceDate}` : ''}${v.vin ? `, VIN ${v.vin}` : ''}`
    + `${v.certifiedPreOwned ? ', Certified Pre-Owned' : ''}`).join('\n');
}
