import { IType, IValue } from "./Value"
import { ArgumentError } from "../../errors/ArgumentError"
import { IValueAttachment, EmptyValueAttachment } from "./ValueAttachment"
import { SimpleValue, SimpleValueSource } from "./SimpleValue"

export class BoolType implements IType {
   readonly name: string = "type-bool"

   constructor() {
   }

   equals(other: IType): boolean {
      if(other == null) {
         throw new ArgumentError(`other value must be valid`)
      }

      return other.name === this.name
   }
}

const SingletonBoolType = new BoolType()

export class BoolValue extends SimpleValue<boolean> {
   
   constructor(value: boolean = true, attachment: IValueAttachment) {
      super(value, SingletonBoolType, attachment)
      this._value = value
   }

   clone(): IValue {
      return new BoolValue(this.value, this.attachment)
   }
}

export class BoolValueSource extends SimpleValueSource<boolean> {
   constructor() {
      super(SingletonBoolType, (val: boolean) => new BoolValue(val, new EmptyValueAttachment()))
   }
}