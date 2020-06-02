import { IType, IValue } from "./Value"
import { ArgumentError } from "../../errors/ArgumentError"
import { IValueAttachment, EmptyValueAttachment } from "./ValueAttachment"
import { SimpleValue, SimpleValueSource } from "./SimpleValue"

export class UIntType implements IType {
   readonly name: string = "type-uint"

   constructor() {
   }

   equals(other: IType): boolean {
      if(other == null) {
         throw new ArgumentError(`other value must be valid`)
      }

      return other.name === this.name
   }
}

const SingletonUIntType = new UIntType()

export class UIntValue extends SimpleValue<number> {

   constructor(value: number = 0, attachment: IValueAttachment) {
      super(value, SingletonUIntType, attachment)

      if(value < 0) {
         throw new ArgumentError(`value must be positive`)
      }
   }

   clone(): IValue {
      return new UIntValue(this.value, this.attachment)
   }
}

export class UIntValueSource extends SimpleValueSource<number> {
   constructor() {
      super(SingletonUIntType, (val: number) => new UIntValue(val, new EmptyValueAttachment()))
   }
}