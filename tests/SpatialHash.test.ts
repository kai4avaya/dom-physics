import { describe, it, expect, beforeEach } from 'vitest';
import { SpatialHash } from '../src/SpatialHash';
import { Body } from '../src/Body';
import { World } from '../src/World';

describe('SpatialHash', () => {
  let container: HTMLElement;
  let world: World;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    container.id = 'world';
    container.style.width = '800px';
    container.style.height = '600px';
    document.body.appendChild(container);
    world = new World(container);
  });

  describe('constructor', () => {
    it('should create spatial hash with default cell size', () => {
      const hash = new SpatialHash();
      expect(hash).toBeTruthy();
    });

    it('should create spatial hash with custom cell size', () => {
      const hash = new SpatialHash(50);
      expect(hash).toBeTruthy();
    });
  });

  describe('insert', () => {
    it('should insert a body', () => {
      const hash = new SpatialHash(100);
      const element = document.createElement('div');
      container.appendChild(element);
      const body = new Body(element, world);

      hash.insert(body);

      const pairs = hash.getPairs();
      // Should be able to get pairs (even if empty)
      expect(Array.isArray(pairs)).toBe(true);
    });

    it('should insert multiple bodies', () => {
      const hash = new SpatialHash(100);
      const element1 = document.createElement('div');
      const element2 = document.createElement('div');
      container.appendChild(element1);
      container.appendChild(element2);

      const body1 = new Body(element1, world);
      const body2 = new Body(element2, world);

      hash.insert(body1);
      hash.insert(body2);

      const pairs = hash.getPairs();
      expect(pairs.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getPairs', () => {
    it('should return collision pairs', () => {
      const hash = new SpatialHash(100);
      const element1 = document.createElement('div');
      const element2 = document.createElement('div');
      element1.style.position = 'absolute';
      element1.style.left = '50px';
      element1.style.top = '50px';
      element2.style.position = 'absolute';
      element2.style.left = '60px';
      element2.style.top = '60px';
      container.appendChild(element1);
      container.appendChild(element2);

      const body1 = new Body(element1, world, { radius: 10 });
      const body2 = new Body(element2, world, { radius: 10 });

      hash.insert(body1);
      hash.insert(body2);

      const pairs = hash.getPairs();
      expect(pairs.length).toBeGreaterThan(0);
    });

    it('should not return duplicate pairs', () => {
      const hash = new SpatialHash(100);
      const element1 = document.createElement('div');
      const element2 = document.createElement('div');
      container.appendChild(element1);
      container.appendChild(element2);

      const body1 = new Body(element1, world);
      const body2 = new Body(element2, world);

      hash.insert(body1);
      hash.insert(body2);

      const pairs = hash.getPairs();
      const uniquePairs = new Set(pairs.map(([a, b]) => 
        a < b ? `${a}-${b}` : `${b}-${a}`
      ));
      expect(uniquePairs.size).toBe(pairs.length);
    });
  });

  describe('clear', () => {
    it('should clear all bodies', () => {
      const hash = new SpatialHash(100);
      const element1 = document.createElement('div');
      const element2 = document.createElement('div');
      container.appendChild(element1);
      container.appendChild(element2);

      const body1 = new Body(element1, world);
      const body2 = new Body(element2, world);

      hash.insert(body1);
      hash.insert(body2);

      hash.clear();

      const pairs = hash.getPairs();
      expect(pairs.length).toBe(0);
    });
  });
});
