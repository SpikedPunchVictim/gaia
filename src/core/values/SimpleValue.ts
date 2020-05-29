import { ArgumentError } from "../../errors/ArgumentError";
import { IValueAttachment } from "./ValueAttachment";
import { asValue } from "../utils/Types";
import { Value, IValue, IType, IValueSource } from "./Value";

export interface ISimpleValue<T> extends IValue {
   readonly value: T
   update(other: IValue): Promise<IValue>
}

export class SimpleValue<T> extends Value implements ISimpleValue<T> {
   protected _value: T

   get value(): T {
      return this._value
   }

   constructor(value: T, type: IType, attachment?: IValueAttachment) {
      super(type, attachment)
      this._value = value
   }

   equals(other: IValue): boolean {
      if(other == null) {
         throw new ArgumentError(`other value must be valid`)
      }

      return this.type.equals(other.type) && this.value === asValue<SimpleValue<T>>(other).value
   }

   async update(other: IValue): Promise<IValue> {
      if(other == null) {
         throw new ArgumentError(`other value must be valid`)
      }

      if(!other.type.equals(this.type)) {
         throw new ArgumentError(`Cannot update a IntValue with an incompatible value`)
      }

      return await this.attachment.request(this, other, () => {
         let simple = asValue<SimpleValue<T>>(other)
         this._value = simple.value
         return this
      })
   }

   async set(other: IValue): Promise<IValue> {
      return this.update(other)
   }

   setLocally(other: IValue): IValue {
      if(other == null) {
         throw new Error(`other Value must be valid`)
      }

      if(!this.type.equals(other.type)) {
         throw new Error(`Cannot set Value. Incompatible Type`)
      }

      let simple = Value.as<SimpleValue<T>>(other)

      this._value = simple.value
      return this
   }
}

export class SimpleValueSource<T> implements IValueSource {
   readonly singletonType: IType
   readonly create: (val: T) => IValue

   constructor(singleton: IType, create: (val: T) => IValue) {
      this.singletonType = singleton
      this.create = create

   }

   type(): IType {
      return this.singletonType
   }

   value(val: T): IValue {
      return this.create(val)
   }
}