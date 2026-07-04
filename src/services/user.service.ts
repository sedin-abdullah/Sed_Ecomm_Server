import { Address, IAddress } from '../models/Address';
import { IUser, User } from '../models/User';
import { AppError } from '../utils/AppError';
import { CreateAddressInput, UpdateAddressInput, UpdateMeInput } from '../validators/user.validator';

export async function updateMe(userId: string, input: UpdateMeInput): Promise<IUser> {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  if (input.name !== undefined) user.name = input.name;
  if (input.phone !== undefined) user.phone = input.phone;
  if (input.avatar !== undefined) user.avatar = input.avatar;

  await user.save();
  return user;
}

export async function listAddresses(userId: string): Promise<IAddress[]> {
  return Address.find({ user: userId }).sort({ isDefault: -1, createdAt: -1 });
}

export async function createAddress(userId: string, input: CreateAddressInput): Promise<IAddress> {
  if (input.isDefault) {
    await Address.updateMany({ user: userId }, { isDefault: false });
  }

  const address = await Address.create({ ...input, user: userId });
  await User.findByIdAndUpdate(userId, { $addToSet: { addresses: address._id } });
  return address;
}

export async function updateAddress(
  userId: string,
  addressId: string,
  input: UpdateAddressInput,
): Promise<IAddress> {
  const address = await Address.findOne({ _id: addressId, user: userId });
  if (!address) {
    throw new AppError('Address not found', 404);
  }

  if (input.isDefault) {
    await Address.updateMany({ user: userId, _id: { $ne: addressId } }, { isDefault: false });
  }

  Object.assign(address, input);
  await address.save();
  return address;
}

export async function deleteAddress(userId: string, addressId: string): Promise<void> {
  const address = await Address.findOneAndDelete({ _id: addressId, user: userId });
  if (!address) {
    throw new AppError('Address not found', 404);
  }
  await User.findByIdAndUpdate(userId, { $pull: { addresses: addressId } });
}
