import { Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';

// Guards the toolchain: constructor injection by type needs decorator metadata.
@Injectable()
class Dependency {
  value(): number {
    return 42;
  }
}

@Injectable()
class Consumer {
  constructor(private readonly dependency: Dependency) {}

  read(): number {
    return this.dependency.value();
  }
}

describe('decorator metadata', () => {
  it('resolves constructor injection by type', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [Dependency, Consumer],
    }).compile();

    expect(moduleRef.get(Consumer).read()).toBe(42);
  });
});
